from django.contrib import admin
from django.urls import path, include
from django.conf import settings

# 1. Import des vues HTML/Admin (restées dans views.py)
from core import views

# 2. Import des nouveaux modules API
from core.api import auth as auth_api
from core.api import inventory as inventory_api
from core.api import market as market_api
from core.api import recipes as recipes_api

urlpatterns = [
    # --- VUES DE GESTION (HTML/Admin) -> Utilisent 'views.' ---
    path('admin/data-management/', views.data_management_view, name='data-management'),
    path('admin/data-management/reset-flyers/', views.reset_flyers_view, name='reset-flyers'),
    path('admin/data-management/reset-community-prices/', views.reset_community_prices_view, name='reset-community-prices'),
    path('admin/data-management/reset-users/', views.reset_users_view, name='reset-users'),
    path('admin/data-management/reset-all/', views.reset_all_data_view, name='reset-all'),

    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    
    # --- VUES PAGES (HTML) -> Utilisent 'views.' ---
    path('', views.assistant_epicerie, name='assistant_epicerie'),
    path('optimiseur/', views.optimiseur_rabais, name='optimiseur_rabais'),
    
    # --- API : AUTHENTIFICATION (auth_api) ---
    path('api/register/', auth_api.register_user, name='api_register'),
    path('api/login/', auth_api.login_user, name='api_login'),
    path('api/logout/', auth_api.logout_user, name='api_logout'),
    
    # --- API : MARCHÉ & RABAIS (market_api) ---
    path('api/import-flyer/', market_api.importer_circulaire, name='api_import_flyer'),
    path('api/rabais-actifs/', market_api.get_rabais_actifs, name='api_get_rabais_actifs'),
    path('api/community-prices/', market_api.get_community_prices, name='api_get_community_prices'),
    path('api/commerces/', market_api.get_commerces, name='api_get_commerces'),
    path('api/circulaires-actives/', market_api.get_circulaires_actives, name='api_get_circulaires_actives'),
    path('api/products/search/', market_api.search_products, name='product_search'),
    path('api/products/', market_api.ProductView.as_view(), name='product_create'),
    path('api/prices/', market_api.PriceSubmissionView.as_view(), name='price_submit'),
    path('api/submit-deal/', market_api.submit_deal, name='api_submit_deal'),
    path('api/prices/<int:price_id>/confirm/', market_api.confirm_price, name='price_confirm'),
    path('api/prices/<int:price_id>/report/', market_api.report_price, name='price_report'),
    path('api/optimize/', market_api.optimize_shopping_list, name='api_optimize_list'),

    # --- API : INVENTAIRE (inventory_api) ---
    path('api/inventory/categories/', inventory_api.InventoryCategoryView.as_view(), name='inventory_category_list'),
    path('api/inventory/categories/<int:category_id>/', inventory_api.InventoryCategoryView.as_view(), name='inventory_category_detail'),
    path('api/inventory/reorder/', inventory_api.reorder_inventory, name='inventory_reorder'),
    path('api/inventory/', inventory_api.InventoryView.as_view(), name='inventory_list'),
    path('api/inventory/<int:item_id>/', inventory_api.InventoryView.as_view(), name='inventory_detail'),
    path('api/inventory/import/', inventory_api.import_inventory, name='inventory_import'),
    path('api/shopping-list/', inventory_api.ShoppingListView.as_view(), name='shopping_list'),
    path('api/shopping-list/<int:item_id>/', inventory_api.ShoppingListItemView.as_view(), name='shopping_list_item'),
    path('api/user/layout/', inventory_api.UserLayoutView.as_view(), name='user_layout'),

    # --- API : RECETTES (recipes_api) ---
    path('api/recipes/', recipes_api.RecipeView.as_view(), name='recipe_list'),
    path('api/recipes/<int:recipe_id>/', recipes_api.RecipeDetailView.as_view(), name='recipe_detail'),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [
        path('__debug__/', include(debug_toolbar.urls)),
    ] + urlpatterns