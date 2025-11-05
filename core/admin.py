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

admin.site.register(Commerce)
admin.site.register(Produit)
admin.site.register(Circulaire)
admin.site.register(Prix)
admin.site.register(Categorie)
# On n'enregistre pas Profile ici car il est déjà visible via le UserAdmin
