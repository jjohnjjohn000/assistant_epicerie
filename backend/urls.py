"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from core import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.assistant_epicerie, name='assistant_epicerie'),
    path('optimiseur/', views.optimiseur_rabais, name='optimiseur_rabais'),
    
    path('api/import-flyer/', views.importer_circulaire, name='api_import_flyer'),

    path('api/rabais-actifs/', views.get_rabais_actifs, name='api_get_rabais_actifs'),
    
    path('api/commerces/', views.get_commerces, name='api_get_commerces'),
    path('api/circulaires-actives/', views.get_circulaires_actives, name='api_get_circulaires_actives'),
]
