# Fichier: core/admin.py

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Commerce, Produit, Circulaire, Prix, Categorie, Profile, Report 

# On crée une vue "inline" pour afficher le profil directement dans la page de l'utilisateur
class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    verbose_name_plural = 'Profil'

# On étend l'administration de l'utilisateur de base pour inclure notre profil
class UserAdmin(BaseUserAdmin):
    inlines = (ProfileInline,)

# On désenregistre l'ancien User admin et on enregistre le nôtre
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """ Administration personnalisée pour les signalements. """
    list_display = ('price_entry', 'reported_by', 'reason', 'status', 'timestamp')
    list_filter = ('status', 'reason')
    search_fields = ('price_entry__produit__nom', 'reported_by__username')
    # Permet de changer le statut directement depuis la liste
    list_editable = ('status',)
    
# --- DÉBUT DES MODIFICATIONS : AMÉLIORATION DE L'ADMIN POUR LE MODÈLE PRIX ---

# 1. On crée un filtre personnalisé pour séparer les types de prix
class PrixTypeFilter(admin.SimpleListFilter):
    """Filtre pour voir les prix communautaires ou ceux des circulaires."""
    title = 'Type de prix'
    parameter_name = 'type'

    def lookups(self, request, model_admin):
        return (
            ('community', 'Prix Communautaire'),
            ('flyer', 'Prix de Circulaire'),
        )

    def queryset(self, request, queryset):
        if self.value() == 'community':
            return queryset.filter(circulaire__isnull=True)
        if self.value() == 'flyer':
            return queryset.filter(circulaire__isnull=False)

# 2. On crée la nouvelle classe d'administration pour le modèle Prix
@admin.register(Prix)
class PrixAdmin(admin.ModelAdmin):
    """ Administration personnalisée pour le modèle Prix. """

    # Affiche des colonnes utiles dans la liste
    list_display = (
        'produit',
        'commerce',
        'prix',
        'type_de_prix', # Notre méthode personnalisée
        'submitted_by',
        'date_mise_a_jour',
    )
    
    # Ajoute des filtres sur le côté droit
    list_filter = (
        PrixTypeFilter, # Notre filtre personnalisé
        'commerce',
        'submitted_by',
    )

    # Ajoute une barre de recherche
    search_fields = (
        'produit__nom',
        'commerce__nom',
        'submitted_by__username',
    )
    
    # Améliore la performance des requêtes
    list_select_related = ('produit', 'commerce', 'circulaire', 'submitted_by')

    # Méthode pour afficher "Communautaire" ou "Circulaire" dans une colonne
    @admin.display(description='Type', ordering='circulaire')
    def type_de_prix(self, obj):
        return "Communautaire" if obj.circulaire is None else "Circulaire"

# --- FIN DES MODIFICATIONS ---

admin.site.register(Commerce)
admin.site.register(Produit)
admin.site.register(Circulaire)
admin.site.register(Categorie)
# On n'enregistre pas Profile ici car il est déjà visible via le UserAdmin
