# urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('api/upload/', views.upload_file, name='upload_file'),
    path('api/analyze/', views.analyze_query, name='analyze_query'),
    path('api/download/', views.download_data, name='download_data'),
]