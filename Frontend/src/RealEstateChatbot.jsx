import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Upload, Send, Download, MessageSquare } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

const RealEstateChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState([]);

  // Upload file to Django backend
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/upload/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setDataLoaded(true);
      setLocations(response.data.locations || []);
      setMessages([{
        type: 'system',
        text: `${response.data.message}. Available locations: ${response.data.locations?.slice(0, 5).join(', ')}...`
      }]);
    } catch (error) {
      setMessages([{ 
        type: 'error', 
        text: `Error: ${error.response?.data?.error || 'Failed to upload file'}` 
      }]);
    }
    setLoading(false);
  };

  // Send query to Django backend
  const handleQuery = async () => {
    if (!input.trim() || !dataLoaded) return;

    const userMessage = input;
    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);
    setLoading(true);
    setInput('');

    try {
      const response = await axios.post(`${API_URL}/analyze/`, {
        query: userMessage
      });

      const botMessage = {
        type: 'bot',
        text: response.data.summary,
        chart: response.data.chart_data,
        table: response.data.table_data?.slice(0, 10),
        fullData: response.data.table_data,
        locations: response.data.locations
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        type: 'error', 
        text: `Error: ${error.response?.data?.error || 'Failed to process query'}` 
      }]);
    }
    setLoading(false);
  };

  // Download filtered data
  const downloadData = async (locs) => {
    try {
      const response = await axios.post(`${API_URL}/download/`, {
        locations: locs
      });

      const blob = new Blob([response.data.csv_data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename || 'data.csv';
      a.click();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Real Estate Analysis Bot</h1>
              <p className="text-sm text-gray-600">Powered by Django + Gemini AI</p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-white shadow-lg p-6 min-h-[500px] max-h-[600px] overflow-y-auto">
          {messages.length === 0 && !dataLoaded ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Upload className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">Upload your Excel file to get started</p>
            </div>
          ) : messages.length > 0 ? (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`${msg.type === 'user' ? 'text-right' : 'text-left'}`}>
                  {msg.type === 'user' && (
                    <div className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-lg max-w-md">
                      {msg.text}
                    </div>
                  )}
                  
                  {msg.type === 'system' && (
                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg inline-block">
                      {msg.text}
                    </div>
                  )}

                  {msg.type === 'error' && (
                    <div className="bg-red-100 text-red-800 px-4 py-2 rounded-lg inline-block">
                      {msg.text}
                    </div>
                  )}

                  {msg.type === 'bot' && (
                    <div className="bg-gray-700 p-4 rounded-lg max-w-4xl inline-block">
                      <div className="whitespace-pre-wrap mb-4">{msg.text}</div>
                      
                      {msg.chart && msg.chart.length > 0 && (
                        <div className="bg-white p-4 rounded-lg mb-4">
                          <h3 className="font-semibold mb-2">Price Trends</h3>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={msg.chart}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="year" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              {Object.keys(msg.chart[0] || {}).filter(k => k !== 'year').map((key, i) => (
                                <Line 
                                  key={key} 
                                  type="monotone" 
                                  dataKey={key} 
                                  stroke={['#8884d8', '#82ca9d', '#ffc658'][i % 3]} 
                                  strokeWidth={2}
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {msg.table && msg.table.length > 0 && (
                        <div className="bg-white rounded-lg overflow-hidden">
                          <div className="flex justify-between items-center p-3 bg-gray-800 border-b">
                            <h3 className="font-semibold">Data Table ({msg.fullData?.length || 0} records)</h3>
                            <button 
                              onClick={() => downloadData(msg.locations)}
                              className="flex items-center gap-2 text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                            >
                              <Download className="w-4 h-4" /> Download
                            </button>
                          </div>
                          <div className="overflow-x-auto max-h-64">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-800 sticky top-0">
                                <tr>
                                  <th className="px-3 py-2 text-left">Location</th>
                                  <th className="px-3 py-2 text-left">Year</th>
                                  <th className="px-3 py-2 text-right">Avg Price</th>
                                  <th className="px-3 py-2 text-right">Total Sales</th>
                                  <th className="px-3 py-2 text-right">Units</th>
                                </tr>
                              </thead>
                              <tbody>
                                {msg.table.map((row, i) => (
                                  <tr key={i} className="border-b bg-gray-800 hover:bg-gray-500">
                                    <td className="px-3 py-2">{row['final location']}</td>
                                    <td className="px-3 py-2">{row.year}</td>
                                    <td className="px-3 py-2 text-right">₹{Math.round(row['flat - weighted average rate'] || 0)}</td>
                                    <td className="px-3 py-2 text-right">₹{((row['total_sales - igr'] || 0) / 10000000).toFixed(2)}Cr</td>
                                    <td className="px-3 py-2 text-right">{Math.round(row['total units'] || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="text-left">
                  <div className="inline-block bg-gray-900 px-4 py-2 rounded-lg">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-gray-700 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-700 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-gray-700 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <MessageSquare className="w-12 h-12 mb-3 text-gray-500" />
              <p>Data loaded! Ask a question below.</p>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-b-2xl shadow-lg p-4 border-t">
          {!dataLoaded ? (
            <div className="flex justify-center">
              <label className="cursor-pointer bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Excel File
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <label className="cursor-pointer bg-white text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                </label>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
                  placeholder="Ask about Wakad, Aundh, Ambegaon, etc..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none ring-2 text-gray-500 ring-gray-300 focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
                <button
                  onClick={handleQuery}
                  disabled={!input.trim() || loading}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Send
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Try: "Analyze Wakad" , "Compare Aundh and Akurdi" , "Show price growth for Ambegaon"
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RealEstateChatbot;