# views.py
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
import pandas as pd
import google.generativeai as genai
import json
import os
from django.core.cache import cache

# Configure Gemini API
genai.configure(api_key=os.environ.get('GEMINI_API_KEY', 'YOUR_GEMINI_API_KEY'))

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def upload_file(request):
    """Upload and parse Excel file"""
    try:
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Read Excel file
        df = pd.read_excel(file)
        
        # Store data in cache (or database for production)
        data_json = df.to_json(orient='records')
        cache.set('real_estate_data', data_json, timeout=3600)
        
        # Get unique locations
        locations = df['final location'].unique().tolist()
        
        return Response({
            'message': f'Successfully loaded {len(df)} records',
            'total_records': len(df),
            'locations': locations[:20],  # First 20 locations
            'columns': df.columns.tolist()
        })
    
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def analyze_query(request):
    """Process user query and return analysis"""
    try:
        query = request.data.get('query', '').lower()
        
        if not query:
            return Response({'error': 'No query provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get cached data
        data_json = cache.get('real_estate_data')
        if not data_json:
            return Response({'error': 'No data loaded. Please upload a file first.'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        df = pd.read_json(data_json)
        
        # Extract locations from query (fuzzy matching)
        locations = df['final location'].unique()
        mentioned_locations = []
        
        for loc in locations:
            loc_lower = loc.lower()
            # Check if location name is in query OR if query words are in location
            if loc_lower in query or any(word in loc_lower for word in query.split() if len(word) > 3):
                mentioned_locations.append(loc)
        
        # Check if it's a general question (no specific location)
        if not mentioned_locations:
            # Check if asking for general info or list of locations
            if any(word in query for word in ['what', 'which', 'how', 'tell', 'explain', 'available', 'locations', 'areas', 'help']):
                summary = handle_general_query(query, df, locations)
                return Response({
                    'summary': summary,
                    'chart_data': [],
                    'table_data': [],
                    'total_records': 0,
                    'locations': []
                })
            else:
                return Response({
                    'summary': f"I couldn't find specific localities in your query. Available locations: {', '.join(locations[:10])}...\n\nYou can ask:\n• 'Analyze [location]'\n• 'Compare [loc1] and [loc2]'\n• 'What are the best areas?'\n• 'Show all locations'",
                    'chart_data': [],
                    'table_data': []
                })
        
        # Filter data for specific locations
        filtered_df = df[df['final location'].isin(mentioned_locations)]
        
        # Prepare chart data
        chart_data = prepare_chart_data(filtered_df, mentioned_locations)
        
        # Generate summary using Gemini
        summary = generate_gemini_summary(filtered_df, mentioned_locations, query)
        
        # Prepare table data
        table_data = filtered_df.head(10).to_dict('records')
        
        return Response({
            'summary': summary,
            'chart_data': chart_data,
            'table_data': table_data,
            'total_records': len(filtered_df),
            'locations': mentioned_locations
        })
    
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def handle_general_query(query, df, locations):
    """Handle general queries without specific locations"""
    try:
        # Prepare overall statistics
        total_locations = len(locations)
        avg_price = df['flat - weighted average rate'].mean()
        total_sales = df['total_sales - igr'].sum() / 10000000
        
        if 'location' in query or 'area' in query or 'available' in query or 'list' in query:
            return f"📍 **Available Locations ({total_locations} areas)**\n\n{', '.join(locations[:20])}{'...' if len(locations) > 20 else ''}\n\nYou can ask about any of these locations!"
        
        # Use Gemini for general questions
        prompt = f"""You are a real estate expert. Answer this question based on the data context:

User Question: {query}

Data Context:
- Total locations covered: {total_locations}
- Average property price: ₹{avg_price:.0f}/sqft
- Total market sales: ₹{total_sales:.2f} Crores
- Locations: {', '.join(locations[:10])}...

Provide a helpful, concise answer (2-3 sentences). If they're asking about best areas or recommendations, mention that you can analyze specific locations if they ask."""

        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        return response.text
        
    except Exception as e:
        return f"I'm here to help with real estate analysis! I have data for {total_locations} locations. Try asking:\n• 'What locations are available?'\n• 'Analyze Wakad'\n• 'Compare Aundh and Akurdi'\n• 'Which area has highest prices?'"


def prepare_chart_data(df, locations):
    """Prepare data for chart visualization"""
    years = sorted(df['year'].unique())
    chart_data = []
    
    for year in years:
        year_data = {'year': int(year)}
        for loc in locations:
            loc_data = df[(df['year'] == year) & (df['final location'] == loc)]
            if not loc_data.empty:
                year_data[loc] = round(float(loc_data['flat - weighted average rate'].iloc[0]))
        chart_data.append(year_data)
    
    return chart_data


def generate_gemini_summary(df, locations, query):
    """Generate summary using Gemini AI"""
    try:
        # Prepare data summary for Gemini
        data_summary = []
        for loc in locations:
            loc_data = df[df['final location'] == loc]
            latest_year = loc_data['year'].max()
            latest_data = loc_data[loc_data['year'] == latest_year].iloc[0]
            
            data_summary.append({
                'location': loc,
                'year': int(latest_year),
                'avg_price': float(latest_data['flat - weighted average rate']),
                'total_sales': float(latest_data['total_sales - igr']),
                'total_units': float(latest_data['total units']),
                'residential_sold': float(latest_data['residential_sold - igr'])
            })
        
        # Create prompt for Gemini
        prompt = f"""You are a real estate analyst. Analyze the following data and provide a concise summary (3-4 sentences) based on the user's query.

User Query: {query}

Data:
{json.dumps(data_summary, indent=2)}

Provide insights about:
- Price trends
- Sales volume
- Market demand
- Comparison if multiple locations

Keep it concise, professional, and actionable. Use Indian Rupee format (₹ and Crores)."""

        # Call Gemini API
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        
        return response.text
    
    except Exception as e:
        # Fallback to basic summary if Gemini fails
        return generate_fallback_summary(df, locations, query)


def generate_fallback_summary(df, locations, query):
    """Fallback summary if Gemini API fails"""
    loc = locations[0]
    loc_data = df[df['final location'] == loc]
    latest_year = loc_data['year'].max()
    latest_data = loc_data[loc_data['year'] == latest_year].iloc[0]
    
    avg_price = round(latest_data['flat - weighted average rate'])
    total_sales = latest_data['total_sales - igr'] / 10000000  # Convert to Cr
    total_units = round(latest_data['total units'])
    
    if 'compare' in query and len(locations) > 1:
        summary = f"Comparison for {' vs '.join(locations)}:\n"
        for l in locations:
            l_data = df[(df['final location'] == l) & (df['year'] == latest_year)].iloc[0]
            summary += f"{l}: ₹{round(l_data['flat - weighted average rate'])}/sqft, {round(l_data['total units'])} units\n"
        return summary
    
    return f"Analysis for {loc}: Average flat price is ₹{avg_price}/sqft ({latest_year}). Total sales: ₹{total_sales:.2f} Cr with {total_units} units sold. Market shows steady activity in this locality."


@api_view(['POST'])
def download_data(request):
    """Return filtered data for download"""
    try:
        locations = request.data.get('locations', [])
        
        data_json = cache.get('real_estate_data')
        if not data_json:
            return Response({'error': 'No data available'}, status=status.HTTP_400_BAD_REQUEST)
        
        df = pd.read_json(data_json)
        
        if locations:
            df = df[df['final location'].isin(locations)]
        
        # Convert to CSV
        csv_data = df.to_csv(index=False)
        
        return Response({
            'csv_data': csv_data,
            'filename': 'real_estate_filtered.csv'
        })
    
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)