# Fichier: core/serializers.py

from rest_framework import serializers
from .models import InventoryItem, ShoppingListItem, Recipe, Produit, Prix, Commerce, InventoryCategory

# --- SÉRIALISEURS D'INVENTAIRE ---

class InventoryCategorySerializer(serializers.ModelSerializer):
    """ Sérialiseur pour les catégories d'inventaire personnalisées. """
    class Meta:
        model = InventoryCategory
        fields = ['id', 'name']

class InventoryItemSerializer(serializers.ModelSerializer):
    # Champ pour afficher le nom de la catégorie en lecture seule
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)

    class Meta:
        model = InventoryItem
        # On expose 'category' pour l'écriture (l'ID) et 'category_name' pour la lecture
        fields = ['id', 'name', 'quantity', 'category', 'category_name', 'alert_threshold']
        # 'category' sera utilisé pour recevoir un ID lors de la création/mise à jour
        extra_kwargs = {
            'category': {'write_only': True, 'required': False, 'allow_null': True}
        }
            
    def __init__(self, *args, **kwargs):
        """ S'assure que l'utilisateur ne peut assigner que ses propres catégories. """
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            self.fields['category'].queryset = InventoryCategory.objects.filter(user=request.user)

# --- NOUVEAU SERIALIZER POUR LA LISTE D'ÉPICERIE ---
class ShoppingListItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShoppingListItem
        fields = ['id', 'name', 'quantity', 'is_checked']

# --- NOUVEAU SERIALIZER POUR LES RECETTES ---
class RecipeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipe
        fields = ['id', 'name', 'ingredients', 'instructions', 'comments']
        
# --- NOUVEAU SERIALIZER POUR LES PRODUITS ---
class ProduitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produit
        fields = ['id', 'nom', 'marque', 'categorie']

# --- NOUVEAU SERIALIZER POUR LA SOUMISSION DE PRIX ---
class PrixSubmissionSerializer(serializers.ModelSerializer):
    # On utilise des champs 'write_only' pour recevoir les noms ou ID du frontend
    produit_id = serializers.IntegerField(write_only=True)
    commerce_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = Prix
        # On inclut les champs nécessaires à la création
        fields = ['id', 'prix', 'details_prix', 'produit_id', 'commerce_id']

    def create(self, validated_data):
        # On utilise le 'user' qui est passé dans le contexte de la vue
        user = self.context['request'].user
        
        # On crée l'objet Prix avec les données validées et l'utilisateur
        prix_obj = Prix.objects.create(
            produit_id=validated_data['produit_id'],
            commerce_id=validated_data['commerce_id'],
            prix=validated_data['prix'],
            details_prix=validated_data.get('details_prix', ''),
            submitted_by=user
        )
        return prix_obj
