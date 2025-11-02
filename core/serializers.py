# Fichier: core/serializers.py

from rest_framework import serializers
from .models import InventoryItem, ShoppingListItem, Recipe, Produit, Prix, Commerce

class InventoryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        # On liste les champs qu'on veut exposer dans notre API
        fields = ['id', 'name', 'quantity', 'category', 'alert_threshold']
        
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
