from django.http import JsonResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from django.shortcuts import get_object_or_404
from datetime import datetime, timedelta
from django.db.models import Prefetch, Count, Q
from collections import defaultdict
import difflib # Nécessaire pour l'optimisation

from core.models import Commerce, Produit, Circulaire, Prix, Categorie, Profile, Report
from core.serializers import ProduitSerializer, PrixSubmissionSerializer

# --- IMPORTATION DE CIRCULAIRE ---
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

        date_debut_str = data.get("date_debut")
        date_fin_str = data.get("date_fin")
        
        if not date_debut_str or not date_fin_str:
            raise ValueError("Les clés 'date_debut' et 'date_fin' sont manquantes.")

        circulaire_obj = Circulaire.objects.create(
            commerce=commerce_obj,
            date_debut=datetime.strptime(date_debut_str, "%Y-%m-%d").date(),
            date_fin=datetime.strptime(date_fin_str, "%Y-%m-%d").date(),
        )
        items_ajoutes = 0
        for categorie in data.get("categories", []):
            categorie_nom = categorie.get("category_name", "Divers") or "Divers"
            categorie_obj, _ = Categorie.objects.get_or_create(nom=categorie_nom)

            for item in categorie.get("items", []):
                produit_obj, created_produit = Produit.objects.get_or_create(
                    nom=item["name"],
                    defaults={
                        "marque": item.get("brand", ""),
                        "categorie": categorie_obj,
                    },
                )
                if not created_produit and produit_obj.categorie != categorie_obj:
                    produit_obj.categorie = categorie_obj
                    produit_obj.save()
                
                prix_value = item.get("single_price")
                if prix_value is None or prix_value == '':
                    prix_value = 0.00
                Prix.objects.create(
                    produit=produit_obj,
                    commerce=commerce_obj,
                    circulaire=circulaire_obj,
                    prix=float(prix_value),
                    details_prix=item.get("price", ""),
                )
                items_ajoutes += 1
        
        return Response(
            { "status": "succès", "message": f"{items_ajoutes} articles importés pour {commerce_obj.nom}." },
            status=status.HTTP_201_CREATED,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"status": "erreur", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)

# --- AFFICHAGE (GET) ---

@api_view(['GET'])
@permission_classes([AllowAny])
def get_circulaires_actives(request):
    today = timezone.now().date()
    circulaires_actives = Circulaire.objects.filter(
        date_debut__lte=today,
        date_fin__gte=today
    ).prefetch_related(
        Prefetch('prix', queryset=Prix.objects.select_related('produit', 'produit__categorie'))
    ).select_related('commerce')
    
    data = {}
    for circulaire in circulaires_actives:
        commerce_nom = circulaire.commerce.nom
        items_par_categorie = defaultdict(list)
        for prix_obj in circulaire.prix.all():
            categorie_nom = prix_obj.produit.categorie.nom if prix_obj.produit.categorie else "Divers"
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

@api_view(['GET'])
@permission_classes([AllowAny])
def get_commerces(request):
    commerces = Commerce.objects.all().values('id', 'nom', 'adresse', 'site_web')
    return JsonResponse(list(commerces), safe=False)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_rabais_actifs(request):
    today = timezone.now().date()
    
    # --- DEBUG LOGS (Regarde le terminal) ---
    print(f"--- DEBUG RABAIS ACTIFS ---")
    print(f"1. Date utilisée par le serveur : {today}")
    
    # Compte total des prix liés à une circulaire (peu importe la date)
    total_circulaire = Prix.objects.filter(circulaire__isnull=False).count()
    print(f"2. Total prix de type 'Circulaire' en DB : {total_circulaire}")

    # On regarde s'il y a des circulaires qui couvrent "aujourd'hui"
    circulaires_valides = Circulaire.objects.filter(date_debut__lte=today, date_fin__gte=today)
    print(f"3. Nombre de circulaires valides pour cette date : {circulaires_valides.count()}")
    for c in circulaires_valides:
        print(f"   - Circulaire trouvée : {c.commerce.nom} ({c.date_debut} au {c.date_fin})")

    # La requête finale
    prix_en_rabais = Prix.objects.select_related("produit", "commerce", "submitted_by", "produit__categorie").filter(
        circulaire__isnull=False,
        circulaire__date_debut__lte=today,
        circulaire__date_fin__gte=today,
    )
    
    count_result = prix_en_rabais.count()
    print(f"4. Résultat final renvoyé au JS : {count_result} articles")
    # ---------------------------------------

    data = []
    for prix_obj in prix_en_rabais:
        details = f"🔥 {prix_obj.details_prix or str(prix_obj.prix) + ' $'}"
        submitter_username = prix_obj.submitted_by.username if prix_obj.submitted_by else None
        if submitter_username:
            details += f" (Ajouté par 👤 {submitter_username})"

        categorie_nom = "Non classé"
        if prix_obj.produit.categorie:
            categorie_nom = prix_obj.produit.categorie.nom

        data.append({
            "price_id": prix_obj.id,
            "produit_nom": prix_obj.produit.nom,
            "commerce_nom": prix_obj.commerce.nom,
            "categorie_nom": categorie_nom,
            "details_prix": details,
            "prix": str(prix_obj.prix),
            "submitted_by_username": submitter_username
        })
    return JsonResponse(data, safe=False)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_community_prices(request):
    one_week_ago = timezone.now() - timedelta(days=7)
    prix_communautaires = Prix.objects.filter(
        circulaire__isnull=True,
        date_mise_a_jour__gte=one_week_ago
    ).annotate(
        confirmations_count=Count('confirmations')
    ).select_related("produit", "commerce", "submitted_by")

    data = []
    for prix_obj in prix_communautaires:
        confirmation_text = f"({prix_obj.confirmations_count} ✓)" if prix_obj.confirmations_count > 0 else ""
        submitter_username = prix_obj.submitted_by.username if prix_obj.submitted_by else None
        submitter_text = f" (Ajouté par 👤 {submitter_username})" if submitter_username else ""

        data.append({
            "price_id": prix_obj.id,
            "produit_nom": prix_obj.produit.nom,
            "commerce_nom": prix_obj.commerce.nom,
            "details_prix": f"👥 {str(prix_obj.prix)} $ {confirmation_text}{submitter_text}",
            "prix": str(prix_obj.prix),
            "submitted_by_username": submitter_username
        })
    return Response(data)

# --- CONTRIBUTION COMMUNAUTAIRE ---

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_products(request):
    query = request.query_params.get('q', None)
    if query:
        produits = Produit.objects.filter(nom__icontains=query) | Produit.objects.filter(marque__icontains=query)
        serializer = ProduitSerializer(produits, many=True)
        return Response(serializer.data)
    return Response([], status=status.HTTP_200_OK)

class ProductView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        serializer = ProduitSerializer(data=request.data)
        if serializer.is_valid():
            nom = serializer.validated_data.get('nom')
            marque = serializer.validated_data.get('marque')
            if Produit.objects.filter(nom__iexact=nom, marque__iexact=marque).exists():
                return Response({'error': 'Ce produit existe déjà.'}, status=status.HTTP_409_CONFLICT)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PriceSubmissionView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        serializer = PrixSubmissionSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Prix soumis avec succès !'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_deal(request):
    data = request.data
    required_fields = ['product_name', 'commerce_id', 'price_details', 'single_price', 'date_debut', 'date_fin']
    if not all(field in data for field in required_fields):
        return Response({'error': 'Tous les champs sont requis.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        product_name = data['product_name'].strip()
        brand = data.get('brand', '').strip()
        produit_obj, _ = Produit.objects.get_or_create(
            nom__iexact=product_name, 
            marque__iexact=brand,
            defaults={'nom': product_name, 'marque': brand}
        )
        commerce_obj = get_object_or_404(Commerce, id=data['commerce_id'])
        date_debut = datetime.strptime(data['date_debut'], '%Y-%m-%d').date()
        date_fin = datetime.strptime(data['date_fin'], '%Y-%m-%d').date()

        circulaire_obj, _ = Circulaire.objects.get_or_create(
            commerce=commerce_obj, date_debut=date_debut, date_fin=date_fin
        )
        Prix.objects.create(
            produit=produit_obj, commerce=commerce_obj, circulaire=circulaire_obj,
            prix=data['single_price'], details_prix=data['price_details'], submitted_by=request.user
        )
        return Response({'message': 'Rabais soumis avec succès !'}, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_price(request, price_id):
    price_entry = get_object_or_404(Prix, id=price_id)
    user = request.user
    if price_entry.submitted_by == user:
        return Response({'error': 'Vous ne pouvez pas confirmer votre propre prix.'}, status=status.HTTP_403_FORBIDDEN)
    if price_entry.confirmations.filter(id=user.id).exists():
        return Response({'message': 'Déjà confirmé.'}, status=status.HTTP_200_OK)

    price_entry.confirmations.add(user)
    if price_entry.submitted_by:
        submitter_profile, _ = Profile.objects.get_or_create(user=price_entry.submitted_by)
        submitter_profile.reputation += 5
        submitter_profile.save()
    
    return Response({'status': 'succès', 'message': 'Prix confirmé !'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_price(request, price_id):
    price_entry = get_object_or_404(Prix, id=price_id)
    user = request.user
    reason = request.data.get('reason')
    comments = request.data.get('comments', '')

    if not reason:
        return Response({'error': 'Raison requise.'}, status=status.HTTP_400_BAD_REQUEST)
    if Report.objects.filter(price_entry=price_entry, reported_by=user).exists():
        return Response({'message': 'Déjà signalé.'}, status=status.HTTP_200_OK)

    Report.objects.create(price_entry=price_entry, reported_by=user, reason=reason, comments=comments)
    return Response({'status': 'succès', 'message': 'Signalement envoyé.'}, status=status.HTTP_201_CREATED)

# --- OPTIMISATION (Backend Intelligence) ---

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def optimize_shopping_list(request):
    shopping_list = request.data.get('items', [])
    selected_stores = request.data.get('stores', [])
    
    # --- DEBUG PRINTS (Regarde ton terminal après avoir cliqué) ---
    print(f"--- DÉBUT OPTIMISATION ---")
    print(f"1. Magasins demandés par le client : {selected_stores}")
    print(f"2. Articles à chercher : {len(shopping_list)}")

    if not shopping_list:
        return Response([])

    today = timezone.now().date()
    one_week_ago = timezone.now() - timedelta(days=7)

    # CORRECTION : On filtre moins strictement sur les magasins
    # Au lieu de chercher le nom EXACT, on cherche si le nom contient la chaîne
    # Exemple : "IGA" trouvera "IGA Extra"
    # On construit une requête Q complexe pour ça
    store_filter = Q()
    for store_name in selected_stores:
        store_filter |= Q(commerce__nom__icontains=store_name)

    base_query = Prix.objects.filter(store_filter).select_related('produit', 'commerce', 'submitted_by')
    
    # DEBUG : Vérifier combien de prix on trouve avant date
    count_total = base_query.count()
    print(f"3. Prix trouvés pour ces magasins (Total historique) : {count_total}")

    condition_flyer = Q(circulaire__isnull=False, circulaire__date_debut__lte=today, circulaire__date_fin__gte=today)
    condition_community = Q(circulaire__isnull=True, date_mise_a_jour__gte=one_week_ago)
    
    available_prices = base_query.filter(condition_flyer | condition_community)

    # DEBUG : Vérifier combien de prix actifs
    print(f"4. Prix ACTIFS trouvés (après filtre date) : {available_prices.count()}")

    prices_db = []
    for p in available_prices:
        prices_db.append({
            'obj': p,
            'norm_name': p.produit.nom.lower(),
            'type': 'rabais' if p.circulaire else 'communautaire'
        })

    optimized_results = []

    for item in shopping_list:
        item_name = item.get('name', '').strip()
        if not item_name: continue
            
        item_norm = item_name.lower()
        found_deals = []

        # 1. Match exact
        for entry in prices_db:
            if item_norm in entry['norm_name']: # "Lait" est dans "Lait 2%"
                found_deals.append(format_deal_response(entry['obj'], entry['type']))

        # 2. Match flou
        if len(found_deals) < 3:
            all_names = [p['norm_name'] for p in prices_db]
            matches = difflib.get_close_matches(item_norm, all_names, n=5, cutoff=0.5) # Seuil baissé à 0.5
            for match_name in matches:
                for entry in prices_db:
                    if entry['norm_name'] == match_name:
                        deal_data = format_deal_response(entry['obj'], entry['type'])
                        # Éviter doublons (basé sur ID prix)
                        if not any(d['price_id'] == deal_data['price_id'] for d in found_deals):
                            found_deals.append(deal_data)

        optimized_results.append({
            "name": item_name,
            "quantity": item.get('quantity', '1'),
            "deals": found_deals,
            "selectedDeal": None,
            "selectedPrice": ""
        })

    print(f"--- FIN OPTIMISATION ---")
    return Response(optimized_results)

def format_deal_response(price_obj, deal_type):
    details = price_obj.details_prix or f"{price_obj.prix} $"
    details = f"🔥 {details}" if deal_type == 'rabais' else f"👥 {details}"
    return {
        "type": deal_type,
        "price_id": price_obj.id,
        "store": price_obj.commerce.nom,
        "name": price_obj.produit.nom,
        "price": str(price_obj.prix),
        "details": details,
        "submitted_by_username": price_obj.submitted_by.username if price_obj.submitted_by else None
    }