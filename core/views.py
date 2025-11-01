# Fichier : core/views.py

from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from .models import Commerce, Produit, Circulaire, Prix
from django.db.models import Prefetch
from collections import defaultdict

# ... (les autres vues comme assistant_epicerie, optimiseur_rabais) ...
def assistant_epicerie(request):
    return render(request, 'core/assistant_epicerie.html')

def optimiseur_rabais(request):
    return render(request, 'core/optimiseur_rabais.html')

@api_view(['POST'])
def importer_circulaire(request):
    try:
        data = request.data
        
        nom_commerce = data.get("store")
        if not nom_commerce:
            raise ValueError("Le nom du magasin ('store') est manquant dans le JSON.")

        commerce_obj, created = Commerce.objects.get_or_create(
            nom=nom_commerce,
            defaults={ "adresse": data.get("address", ""), "site_web": data.get("website", "") },
        )

        if not created:
            commerce_obj.adresse = data.get("address", commerce_obj.adresse)
            commerce_obj.site_web = data.get("website", commerce_obj.site_web)
            commerce_obj.save()

        # Le code lira maintenant les clés fournies par le nouveau prompt
        date_debut_str = data.get("date_debut") # Pas de valeur par défaut pour voir l'erreur si absente
        date_fin_str = data.get("date_fin")
        
        if not date_debut_str or not date_fin_str:
            raise ValueError("Les clés 'date_debut' et 'date_fin' sont manquantes ou vides dans le JSON.")

        circulaire_obj = Circulaire.objects.create(
            commerce=commerce_obj,
            date_debut=datetime.strptime(date_debut_str, "%Y-%m-%d").date(),
            date_fin=datetime.strptime(date_fin_str, "%Y-%m-%d").date(),
        )
        items_ajoutes = 0
        for categorie in data.get("categories", []):
            for item in categorie.get("items", []):
                produit_obj, created_produit = Produit.objects.get_or_create(
                    nom=item["name"],
                    defaults={
                        "marque": item.get("brand", ""),
                        "categorie": categorie.get("category_name", "Divers"),
                    },
                )
                prix_value = item.get("single_price")
                if prix_value is None or prix_value == '':
                    prix_value = 0.00
                Prix.objects.create(
                    produit=produit_obj,
                    commerce=commerce_obj,
                    circulaire=circulaire_obj,
                    prix=prix_value,
                    details_prix=item.get("price", ""),
                )
                items_ajoutes += 1
        
        return Response(
            { "status": "succès", "message": f"{items_ajoutes} articles importés pour la circulaire de {commerce_obj.nom}." },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        return Response(
            {"status": "erreur", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

# ... (les vues get_rabais_actifs et get_commerces restent les mêmes) ...
def get_rabais_actifs(request):
    today = timezone.now().date()
    prix_en_rabais = Prix.objects.filter(
        circulaire__isnull=False,
        circulaire__date_debut__lte=today,
        circulaire__date_fin__gte=today,
    ).select_related("produit", "commerce")
    data = []
    for prix_obj in prix_en_rabais:
        data.append({
            "produit_nom": prix_obj.produit.nom,
            "produit_marque": prix_obj.produit.marque,
            "commerce_nom": prix_obj.commerce.nom,
            "prix": str(prix_obj.prix),
            "details_prix": prix_obj.details_prix,
        })
    return JsonResponse(data, safe=False)

def get_commerces(request):
    commerces = Commerce.objects.all().values('nom', 'adresse', 'site_web')
    data = list(commerces)
    return JsonResponse(data, safe=False)

def get_circulaires_actives(request):
    today = timezone.now().date()
    circulaires_actives = Circulaire.objects.filter(
        date_debut__lte=today,
        date_fin__gte=today
    ).prefetch_related(
        Prefetch('prix', queryset=Prix.objects.select_related('produit'))
    ).select_related('commerce')
    data = {}
    for circulaire in circulaires_actives:
        commerce_nom = circulaire.commerce.nom
        items_par_categorie = defaultdict(list)
        for prix_obj in circulaire.prix.all():
            categorie_nom = prix_obj.produit.categorie or "Divers"
            items_par_categorie[categorie_nom].append({
                "name": prix_obj.produit.nom,
                "brand": prix_obj.produit.marque,
                "price": prix_obj.details_prix,
                "single_price": str(prix_obj.prix),
            })
        data[commerce_nom] = {
            "categories": [
                { "category_name": nom, "items": items }
                for nom, items in items_par_categorie.items()
            ]
        }
    return JsonResponse(data)
