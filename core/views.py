from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from .models import Commerce, Produit, Circulaire, Prix

# Vue pour la page principale
def assistant_epicerie(request):
    return render(request, 'core/assistant_epicerie.html')

# Vue pour la page de l'optimiseur
def optimiseur_rabais(request):
    return render(request, 'core/optimiseur_rabais.html')

# API pour importer une circulaire (écriture)
@api_view(['POST'])
def importer_circulaire(request):
    """
    Le point d'entrée de l'API pour importer un JSON de circulaire.
    """
    try:
        data = request.data
        commerce_obj, created = Commerce.objects.get_or_create(
            nom=data["store"],
            defaults={"site_web": data.get("website", "")},
        )
        date_debut_str = data.get("date_debut", "1900-01-01")
        date_fin_str = data.get("date_fin", "1900-01-01")
        circulaire_obj = Circulaire.objects.create(
            commerce=commerce_obj,
            date_debut=datetime.strptime(date_debut_str, "%Y-%m-%d").date(),
            date_fin=datetime.strptime(date_fin_str, "%Y-%m-%d").date(),
        )
        items_ajoutes = 0
        for categorie in data.get("categories", []):
            for item in categorie.get("items", []):
                produit_obj, created = Produit.objects.get_or_create(
                    nom=item["name"],
                    defaults={
                        "marque": item.get("brand", ""),
                        "categorie": categorie.get("category_name", ""),
                    },
                )
                Prix.objects.create(
                    produit=produit_obj,
                    commerce=commerce_obj,
                    circulaire=circulaire_obj,
                    prix=item.get("single_price", 0.00),
                    details_prix=item.get("price", ""),
                )
                items_ajoutes += 1
        return Response(
            {
                "status": "succès",
                "message": f"{items_ajoutes} articles importés pour la circulaire de {commerce_obj.nom}.",
            },
            status=status.HTTP_201_CREATED,
        )
    except Exception as e:
        return Response(
            {"status": "erreur", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

# API pour récupérer les rabais (lecture) - Maintenant au bon endroit !
def get_rabais_actifs(request):
    """
    Cette vue récupère tous les prix associés à une circulaire active
    et les renvoie au format JSON.
    """
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
