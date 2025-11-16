# Fichier: core/admin.py

from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.shortcuts import render
from django import forms

# Import de tous les modèles nécessaires
from .models import (
    Commerce, Produit, Circulaire, Prix, Categorie, Profile, Report,
    InventoryItem, ShoppingListItem, Recipe
)

# On crée une vue "inline" pour afficher le profil directement dans la page de l'utilisateur
class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    verbose_name_plural = 'Profil'

# -- INLINES POUR LES DONNÉES UTILISATEUR ---

class InventoryItemInline(admin.TabularInline):
    """Affiche l'inventaire de l'utilisateur de manière compacte."""
    model = InventoryItem
    extra = 0
    fields = ('name', 'quantity', 'category', 'alert_threshold')
    verbose_name_plural = "Inventaire de l'utilisateur"
    raw_id_fields = ('category',)

class ShoppingListItemInline(admin.TabularInline):
    """Affiche la liste d'épicerie de l'utilisateur."""
    model = ShoppingListItem
    extra = 0
    fields = ('name', 'quantity', 'is_checked', 'date_added')
    readonly_fields = ('date_added',)
    verbose_name_plural = "Liste d'épicerie"

class RecipeInline(admin.TabularInline):
    """Affiche les recettes de l'utilisateur avec un lien pour les éditer."""
    model = Recipe
    extra = 0
    fields = ('name', 'date_created')
    readonly_fields = ('date_created',)
    show_change_link = True
    verbose_name_plural = "Livre de recettes"

# --- ACTION DE TRANSFERT ---

class UserTransferForm(forms.Form):
    """Formulaire pour sélectionner l'utilisateur de destination."""
    target_user = forms.ModelChoiceField(
        queryset=User.objects.all().order_by('username'),
        label="Transférer les données vers l'utilisateur :"
    )

@admin.action(description="Transférer les données vers un autre utilisateur")
def transfer_data(modeladmin, request, queryset):
    """Action admin pour déplacer les données d'un utilisateur à un autre."""
    if queryset.count() != 1:
        modeladmin.message_user(
            request,
            "Veuillez sélectionner un seul utilisateur pour cette action.",
            messages.ERROR
        )
        return

    source_user = queryset.first()
    
    if 'apply' in request.POST:
        form = UserTransferForm(request.POST)
        if form.is_valid():
            target_user = form.cleaned_data['target_user']

            if source_user == target_user:
                modeladmin.message_user(request, "L'utilisateur source et destination ne peuvent pas être identiques.", messages.ERROR)
                return

            transferred_counts = {'inventory': 0, 'shopping_list': 0, 'recipes': 0}
            skipped_inventory = 0

            for item in InventoryItem.objects.filter(user=source_user):
                if not InventoryItem.objects.filter(user=target_user, name__iexact=item.name).exists():
                    item.user = target_user
                    item.save()
                    transferred_counts['inventory'] += 1
                else:
                    item.delete()
                    skipped_inventory += 1
            
            list_count = ShoppingListItem.objects.filter(user=source_user).update(user=target_user)
            transferred_counts['shopping_list'] = list_count

            recipe_count = Recipe.objects.filter(user=source_user).update(user=target_user)
            transferred_counts['recipes'] = recipe_count

            modeladmin.message_user(request, f"""
                Transfert de {source_user.username} vers {target_user.username} terminé.
                - {transferred_counts['inventory']} article(s) d'inventaire transféré(s).
                - {skipped_inventory} article(s) d'inventaire ignoré(s) car déjà existant(s) pour la cible.
                - {transferred_counts['shopping_list']} article(s) de liste d'épicerie transféré(s).
                - {transferred_counts['recipes']} recette(s) transférée(s).
            """, messages.SUCCESS)
            return

    form = UserTransferForm(initial={
        admin.helpers.ACTION_CHECKBOX_NAME: queryset.values_list('pk', flat=True)
    })

    return render(request, 'admin/action_intermediate.html', {
        'title': "Confirmer le transfert de données",
        'queryset': queryset,
        'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
        'form': form,
        'opts': modeladmin.model._meta,
    })

# 3. MAINTENANT, ON PEUT DÉFINIR LA CLASSE UserAdmin QUI UTILISE LES ÉLÉMENTS CI-DESSUS
class UserAdmin(BaseUserAdmin):
    inlines = (ProfileInline, InventoryItemInline, ShoppingListItemInline, RecipeInline)
    actions = [transfer_data]

# On désenregistre l'ancien User admin et on enregistre le nôtre
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """ Administration personnalisée pour les signalements. """
    list_display = ('price_entry', 'reported_by', 'reason', 'status', 'timestamp')
    list_filter = ('status', 'reason')
    search_fields = ('price_entry__produit__nom', 'reported_by__username')
    list_editable = ('status',)
    
# --- AMÉLIORATION DE L'ADMIN POUR LE MODÈLE PRIX ---

# Filtre personnalisé pour les types de prix
class PrixTypeFilter(admin.SimpleListFilter):
    title = 'Type de prix'
    parameter_name = 'type'

    def lookups(self, request, model_admin):
        return (('community', 'Prix Communautaire'), ('flyer', 'Prix de Circulaire'))

    def queryset(self, request, queryset):
        if self.value() == 'community':
            return queryset.filter(circulaire__isnull=True)
        if self.value() == 'flyer':
            return queryset.filter(circulaire__isnull=False)

# Classe d'administration pour le modèle Prix
@admin.register(Prix)
class PrixAdmin(admin.ModelAdmin):
    list_display = (
        'produit', 'commerce', 'prix', 'type_de_prix', 'submitted_by',
        'date_mise_a_jour',
    )
    list_filter = (PrixTypeFilter, 'commerce', 'submitted_by',)
    search_fields = (
        'produit__nom', 'commerce__nom', 'submitted_by__username',
    )
    list_select_related = ('produit', 'commerce', 'circulaire', 'submitted_by')

    @admin.display(description='Type', ordering='circulaire')
    def type_de_prix(self, obj):
        return "Communautaire" if obj.circulaire is None else "Circulaire"

# Administration pour les modèles de données utilisateur
@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'quantity', 'category', 'date_added')
    list_filter = ('user', 'category')
    search_fields = ('name', 'user__username')
    list_select_related = ('user', 'category')

@admin.register(ShoppingListItem)
class ShoppingListItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'quantity', 'is_checked', 'date_added')
    list_filter = ('user', 'is_checked')
    search_fields = ('name', 'user__username')
    list_select_related = ('user',)

@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'date_created')
    list_filter = ('user',)
    search_fields = ('name', 'user__username', 'ingredients')
    list_select_related = ('user',)

# Enregistrement des autres modèles
admin.site.register(Commerce)
admin.site.register(Produit)
admin.site.register(Circulaire)
admin.site.register(Categorie)
# On n'enregistre pas Profile ici car il est déjà visible via le UserAdmin
