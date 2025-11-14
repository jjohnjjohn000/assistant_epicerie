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
from django.urls import path, include
from core import views
from django.conf import settings

# --- NOUVELLES IMPORTATIONS ---
from core.views import (
    data_management_view,
    reset_flyers_view,
    reset_community_prices_view,
    reset_users_view,
    reset_all_data_view,
)
# --- FIN DES NOUVELLES IMPORTATIONS ---

urlpatterns = [
    # --- DÉBUT DES NOUVELLES URLS DE GESTION ---
    # On les place avant l'URL admin par défaut
    path('admin/data-management/', data_management_view, name='data-management'),
    path('admin/data-management/reset-flyers/', reset_flyers_view, name='reset-flyers'),
    path('admin/data-management/reset-community-prices/', reset_community_prices_view, name='reset-community-prices'),
    path('admin/data-management/reset-users/', reset_users_view, name='reset-users'),
    path('admin/data-management/reset-all/', reset_all_data_view, name='reset-all'),
    # --- FIN DES NOUVELLES URLS DE GESTION ---

    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', views.assistant_epicerie, name='assistant_epicerie'),
    path('optimiseur/', views.optimiseur_rabais, name='optimiseur_rabais'),
    
    # --- URLS DE L'API EXISTANTE ---
    path('api/import-flyer/', views.importer_circulaire, name='api_import_flyer'),
    path('api/rabais-actifs/', views.get_rabais_actifs, name='api_get_rabais_actifs'),
    path('api/community-prices/', views.get_community_prices, name='api_get_community_prices'),
    path('api/commerces/', views.get_commerces, name='api_get_commerces'),
    path('api/circulaires-actives/', views.get_circulaires_actives, name='api_get_circulaires_actives'),

        
    # --- NOUVELLES URLS POUR L'INVENTAIRE ---
    path('api/inventory/', views.InventoryView.as_view(), name='inventory_list'),
    path('api/inventory/<int:item_id>/', views.InventoryView.as_view(), name='inventory_detail'),
    path('api/inventory/import/', views.import_inventory, name='inventory_import'),

    
    # --- NOUVELLES URLS POUR L'AUTHENTIFICATION ---
    path('api/register/', views.register_user, name='api_register'),
    path('api/login/', views.login_user, name='api_login'),
    path('api/logout/', views.logout_user, name='api_logout'),
    
    # --- NOUVELLES URLS POUR LA CONTRIBUTION COMMUNAUTAIRE ---
    path('api/products/search/', views.search_products, name='product_search'),
    path('api/products/', views.ProductView.as_view(), name='product_create'),
    path('api/prices/', views.PriceSubmissionView.as_view(), name='price_submit'),
    
    path('api/submit-deal/', views.submit_deal, name='api_submit_deal'),
    
    # --- NOUVELLE URL POUR LA CONFIRMATION DE PRIX ---
    path('api/prices/<int:price_id>/confirm/', views.confirm_price, name='price_confirm'),
    path('api/prices/', views.PriceSubmissionView.as_view(), name='price_submit'),
    
    # --- NOUVELLE URL POUR LE SIGNALEMENT DE PRIX ---
    path('api/prices/<int:price_id>/report/', views.report_price, name='price_report'),
    path('api/prices/', views.PriceSubmissionView.as_view(), name='price_submit'),
    
    # --- URLS POUR LA LISTE D'ÉPICERIE ---
    path('api/shopping-list/', views.ShoppingListView.as_view(), name='shopping_list'),
    path('api/shopping-list/<int:item_id>/', views.ShoppingListItemView.as_view(), name='shopping_list_item'),

    # --- URLS POUR LES RECETTES ---
    path('api/recipes/', views.RecipeView.as_view(), name='recipe_list'),
    path('api/recipes/<int:recipe_id>/', views.RecipeDetailView.as_view(), name='recipe_detail'),

    # --- NOUVELLE URL POUR LA DISPOSITION ---
    path('api/user/layout/', views.UserLayoutView.as_view(), name='user_layout'),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [
        path('__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns
