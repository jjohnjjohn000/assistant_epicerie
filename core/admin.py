from django.contrib import admin
from .models import Commerce, Produit, Circulaire, Prix, Categorie # Importez les nouveaux modèles

# Register your models here.
admin.site.register(Commerce)
admin.site.register(Produit)
admin.site.register(Circulaire)
admin.site.register(Prix)
admin.site.register(Categorie)
