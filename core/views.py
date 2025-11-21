# Fichier : core/views.py

from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.template.response import TemplateResponse
from django.http import HttpResponseRedirect
from django.contrib import messages
from django.contrib.auth.models import User
from .models import Prix, Circulaire, InventoryItem, ShoppingListItem, Recipe, Produit, Commerce, Categorie, Report

# --- VUES HTML (PAGES) ---

def assistant_epicerie(request):
    return render(request, 'core/assistant_epicerie.html')


def optimiseur_rabais(request):
    return render(request, 'core/optimiseur_rabais.html')


@staff_member_required
def data_management_view(request):
    """
    Affiche la page principale de gestion des données.
    """
    context = {
        'title': 'Gestion Avancée des Données',
        'has_permission': request.user.is_superuser,
    }
    # On ajoute le contexte de l'admin pour que le template fonctionne correctement
    context.update(admin.site.each_context(request))
    return TemplateResponse(request, 'admin/data_management.html', context)


@staff_member_required
def reset_flyers_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        prix_count, _ = Prix.objects.filter(circulaire__isnull=False).delete()
        circulaire_count, _ = Circulaire.objects.all().delete()
        messages.success(request, f'{circulaire_count} circulaires et {prix_count} prix associés ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')


@staff_member_required
def reset_community_prices_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        count, _ = Prix.objects.filter(circulaire__isnull=True).delete()
        messages.success(request, f'{count} prix communautaires ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')


@staff_member_required
def reset_users_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        count, _ = User.objects.filter(is_superuser=False).delete()
        messages.success(request, f'{count} utilisateurs (non-administrateurs) ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')


@staff_member_required
def reset_all_data_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        Report.objects.all().delete()
        Prix.objects.all().delete()
        Circulaire.objects.all().delete()
        InventoryItem.objects.all().delete()
        ShoppingListItem.objects.all().delete()
        Recipe.objects.all().delete()
        Produit.objects.all().delete()
        Commerce.objects.all().delete()
        Categorie.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()
        messages.warning(request, 'La base de données a été entièrement réinitialisée (sauf les comptes administrateurs).')
    return HttpResponseRedirect('/admin/data-management/')
