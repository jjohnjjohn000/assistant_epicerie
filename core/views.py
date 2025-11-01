from django.shortcuts import render

# Create your views here.

def assistant_epicerie(request):
    return render(request, 'core/assistant_epicerie.html')

def optimiseur_rabais(request):
    return render(request, 'core/optimiseur_rabais.html')

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from .models import Commerce, Produit, Circulaire, Prix # Assurez-vous que tous les modèles sont importés

@api_view(['POST']) # Cette vue n'acceptera que les requêtes de type POST
def importer_circulaire(request):
    """
    Le point d'entrée de l'API pour importer un JSON de circulaire.
    """
    try:
        # On récupère les données JSON envoyées par l'utilisateur
        data = request.data
        
        # --- Étape 1: Gérer le Commerce ---
        # On cherche le commerce par son nom. S'il n'existe pas, on le crée.
        # La fonction get_or_create retourne l'objet et un booléen (created)
        commerce_obj, created = Commerce.objects.get_or_create(
            nom=data['store'],
            defaults={'site_web': data.get('website', '')} # .get() est plus sûr
        )

        # --- Étape 2: Gérer la Circulaire ---
        # On suppose un format de date simple pour l'instant.
        # NOTE : La logique de parsing des dates pourrait être améliorée.
        date_debut_str = data.get('date_debut', '1900-01-01')
        date_fin_str = data.get('date_fin', '1900-01-01')
        
        circulaire_obj = Circulaire.objects.create(
            commerce=commerce_obj,
            date_debut=datetime.strptime(date_debut_str, '%Y-%m-%d').date(),
            date_fin=datetime.strptime(date_fin_str, '%Y-%m-%d').date()
        )

        # --- Étape 3: Parcourir les articles et créer les Produits/Prix ---
        items_ajoutes = 0
        for categorie in data.get('categories', []):
            for item in categorie.get('items', []):
                # On cherche le produit par son nom. S'il n'existe pas, on le crée.
                produit_obj, created = Produit.objects.get_or_create(
                    nom=item['name'],
                    # 'defaults' ne sera utilisé que si le produit est créé
                    defaults={
                        'marque': item.get('brand', ''),
                        'categorie': categorie.get('category_name', '')
                    }
                )
                
                # On crée l'entrée de prix en la reliant à tout le reste
                Prix.objects.create(
                    produit=produit_obj,
                    commerce=commerce_obj,
                    circulaire=circulaire_obj,
                    prix=item.get('single_price', 0.00), # On prend le prix unique
                    details_prix=item.get('price', '') # On met le prix complet en détails
                )
                items_ajoutes += 1
        
        # Si tout s'est bien passé, on renvoie une réponse de succès
        return Response(
            {"status": "succès", "message": f"{items_ajoutes} articles importés pour la circulaire de {commerce_obj.nom}."},
            status=status.HTTP_201_CREATED
        )

    except Exception as e:
        # Si une erreur se produit (JSON mal formé, etc.), on renvoie une erreur claire
        return Response(
            {"status": "erreur", "message": str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
