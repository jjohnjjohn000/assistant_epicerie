# Fichier : core/views.py

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from .models import Commerce, Produit, Circulaire, Prix, Categorie, Profile, Report, InventoryItem, ShoppingListItem, Recipe
from django.db.models import Prefetch, Count
from collections import defaultdict
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from .models import InventoryItem, ShoppingListItem, Recipe
from .serializers import InventoryItemSerializer, ShoppingListItemSerializer, RecipeSerializer, ProduitSerializer, PrixSubmissionSerializer
from datetime import timedelta, date
from django.contrib.admin.views.decorators import staff_member_required
from django.template.response import TemplateResponse
from django.http import HttpResponseRedirect
from django.contrib import messages


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

        date_debut_str = data.get("date_debut")
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
            # --- CORRECTION N°1 : Gérer l'objet Catégorie ---
            categorie_nom = categorie.get("category_name", "Divers")
            if not categorie_nom:
                categorie_nom = "Divers"
            
            # On récupère ou on crée l'OBJET Categorie, pas juste le nom.
            categorie_obj, _ = Categorie.objects.get_or_create(nom=categorie_nom)

            for item in categorie.get("items", []):
                # On utilise l'objet 'categorie_obj' pour créer le produit.
                produit_obj, created_produit = Produit.objects.get_or_create(
                    nom=item["name"],
                    defaults={
                        "marque": item.get("brand", ""),
                        "categorie": categorie_obj, # On assigne l'objet Categorie
                    },
                )
                
                # Bonus : Mettre à jour la catégorie si le produit existait déjà
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
                    prix=float(prix_value), # Assurer que le prix est un nombre
                    details_prix=item.get("price", ""),
                )
                items_ajoutes += 1
        
        return Response(
            { "status": "succès", "message": f"{items_ajoutes} articles importés pour la circulaire de {commerce_obj.nom}." },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        # Affiche une erreur plus détaillée pour le débogage
        import traceback
        traceback.print_exc()
        return Response(
            {"status": "erreur", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST
        )

# ... (les autres vues comme get_rabais_actifs) ...

def get_circulaires_actives(request):
    today = timezone.now().date()
    # On optimise la requête en préchargeant aussi la catégorie du produit
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
            # --- CORRECTION N°2 : Lire le nom de l'objet Catégorie ---
            if prix_obj.produit.categorie:
                categorie_nom = prix_obj.produit.categorie.nom
            else:
                categorie_nom = "Divers"
                
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
    """
    Retourne la liste de tous les commerces avec leur ID, nom, adresse et site web.
    """
    commerces = Commerce.objects.all().values('id', 'nom', 'adresse', 'site_web')
    data = list(commerces)
    return JsonResponse(data, safe=False)

@api_view(['GET'])
@permission_classes([AllowAny])
def get_rabais_actifs(request):
    today = timezone.now().date()
    # On ajoute 'produit__categorie' pour optimiser la requête et l'inclure
    prix_en_rabais = Prix.objects.select_related("produit", "commerce", "submitted_by", "produit__categorie").filter(
        circulaire__isnull=False,
        circulaire__date_debut__lte=today,
        circulaire__date_fin__gte=today,
    )
    data = []
    for prix_obj in prix_en_rabais:
        details = f"🔥 {prix_obj.details_prix or str(prix_obj.prix) + ' $'}"
        
        submitter_username = None
        if prix_obj.submitted_by:
            details += f" (Ajouté par 👤 {prix_obj.submitted_by.username})"
            submitter_username = prix_obj.submitted_by.username

        # On récupère le nom de la catégorie, avec une valeur par défaut
        categorie_nom = "Non classé"
        if prix_obj.produit.categorie:
            categorie_nom = prix_obj.produit.categorie.nom

        data.append({
            "price_id": prix_obj.id,
            "produit_nom": prix_obj.produit.nom,
            "commerce_nom": prix_obj.commerce.nom,
            "categorie_nom": categorie_nom, # On ajoute la catégorie au JSON
            "details_prix": details,
            "prix": str(prix_obj.prix),
            "submitted_by_username": submitter_username
        })
    return JsonResponse(data, safe=False)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_community_prices(request):
    one_week_ago = timezone.now() - timedelta(days=7)
    
    # --- DÉBUT DE LA MODIFICATION MAJEURE ---
    # On retire complètement la logique de 'processed_prices' pour ne plus filtrer les doublons.
    # Chaque soumission valide sera maintenant retournée.
    prix_communautaires = Prix.objects.filter(
        circulaire__isnull=True,
        date_mise_a_jour__gte=one_week_ago
    ).annotate(
        confirmations_count=Count('confirmations')
    ).select_related("produit", "commerce", "submitted_by") # Important d'inclure submitted_by

    data = []
    for prix_obj in prix_communautaires:
        confirmation_text = f"({prix_obj.confirmations_count} ✓)" if prix_obj.confirmations_count > 0 else ""
        submitter_username = None
        submitter_text = ""

        if prix_obj.submitted_by:
            submitter_username = prix_obj.submitted_by.username
            submitter_text = f" (Ajouté par 👤 {submitter_username})"

        data.append({
            "price_id": prix_obj.id,
            "produit_nom": prix_obj.produit.nom,
            "commerce_nom": prix_obj.commerce.nom,
            "details_prix": f"👥 {str(prix_obj.prix)} $ {confirmation_text}{submitter_text}",
            "prix": str(prix_obj.prix),
            # On envoie le nom d'utilisateur directement
            "submitted_by_username": submitter_username
        })
    # --- FIN DE LA MODIFICATION MAJEURE ---
        
    return Response(data)

@api_view(['POST'])
def register_user(request):
    """
    Vue pour l'inscription d'un nouvel utilisateur.
    """
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email')

    if not username or not password or not email:
        return Response({'error': 'Veuillez fournir un nom d\'utilisateur, un email et un mot de passe.'}, status=status.HTTP_400_BAD_REQUEST)
    
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Ce nom d\'utilisateur est déjà pris.'}, status=status.HTTP_400_BAD_REQUEST)

    # create_user gère le hachage sécurisé du mot de passe
    user = User.objects.create_user(username=username, email=email, password=password)
    
    # On crée un jeton pour le nouvel utilisateur
    token, _ = Token.objects.get_or_create(user=user)
    
    return Response({'token': token.key, 'username': user.username}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def login_user(request):
    """
    Vue pour la connexion d'un utilisateur.
    """
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({'error': 'Veuillez fournir un nom d\'utilisateur et un mot de passe.'}, status=status.HTTP_400_BAD_REQUEST)

    # 'authenticate' vérifie si les identifiants sont corrects
    user = authenticate(username=username, password=password)

    if user is not None:
        # Si l'utilisateur est valide, on récupère ou crée son jeton
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'username': user.username})
    else:
        # Si les identifiants sont incorrects
        return Response({'error': 'Identifiants invalides.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated]) # Seul un utilisateur connecté peut se déconnecter
def logout_user(request):
    """
    Vue pour la déconnexion d'un utilisateur.
    """
    try:
        # On supprime simplement le jeton de l'utilisateur
        request.user.auth_token.delete()
        return Response({'message': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- NOUVELLE VUE POUR LA GESTION DE L'INVENTAIRE ---

class InventoryView(APIView):
    """
    API pour gérer l'inventaire de l'utilisateur connecté.
    """
    permission_classes = [IsAuthenticated] # Seuls les utilisateurs connectés peuvent accéder

    def get(self, request):
        """ Retourne la liste complète de l'inventaire de l'utilisateur. """
        items = InventoryItem.objects.filter(user=request.user)
        serializer = InventoryItemSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        """ Ajoute un nouvel article à l'inventaire de l'utilisateur. """
        # On ajoute l'ID de l'utilisateur aux données reçues avant de valider
        data = request.data.copy()
        data['user'] = request.user.id
        
        # On utilise le serializer pour valider et créer l'objet
        serializer = InventoryItemSerializer(data=request.data)
        if serializer.is_valid():
            # request.user est fourni par l'authentification par jeton
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, item_id):
        """ Met à jour un article existant. """
        item = InventoryItem.objects.get(id=item_id, user=request.user)
        serializer = InventoryItemSerializer(item, data=request.data, partial=True) # partial=True permet de ne mettre à jour que certains champs
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, item_id):
        """ Supprime un article de l'inventaire. """
        try:
            item = InventoryItem.objects.get(id=item_id, user=request.user)
            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT) # 204 signifie "Ok, mais pas de contenu à retourner"
        except InventoryItem.DoesNotExist:
            return Response({'error': 'Article non trouvé.'}, status=status.HTTP_404_NOT_FOUND)
            
# --- NOUVELLE VUE POUR L'IMPORTATION EN BLOC ---

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_inventory(request):
    """
    Importe une liste d'articles JSON dans l'inventaire de l'utilisateur.
    Met à jour les articles existants, crée les nouveaux.
    """
    items_data = request.data
    if not isinstance(items_data, list):
        return Response({'error': 'Les données fournies doivent être une liste (un tableau) d\'articles.'}, status=status.HTTP_400_BAD_REQUEST)

    items_created = 0
    items_updated = 0

    for item_data in items_data:
        # On s'assure que l'article a un nom
        item_name = item_data.get('name')
        if not item_name:
            continue # On ignore les articles sans nom

        # update_or_create est parfait pour ça :
        # Il cherche un article avec ce nom pour cet utilisateur.
        # S'il le trouve, il le met à jour. Sinon, il le crée.
        obj, created = InventoryItem.objects.update_or_create(
            user=request.user,
            name=item_name,
            defaults={
                'quantity': item_data.get('quantity', '1'),
                'category': item_data.get('category', 'Épicerie'),
                'alert_threshold': item_data.get('alertThreshold', 2) # Notez le camelCase du JS
            }
        )
        if created:
            items_created += 1
        else:
            items_updated += 1
            
    return Response({
        'message': 'Importation terminée avec succès.',
        'articles_ajoutes': items_created,
        'articles_mis_a_jour': items_updated
    }, status=status.HTTP_200_OK)
    
# --- VUE POUR LA GESTION DE LA LISTE D'ÉPICERIE (corrigée) ---
class ShoppingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = ShoppingListItem.objects.filter(user=request.user)
        serializer = ShoppingListItemSerializer(items, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ShoppingListItemSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            # LA CORRECTION EST ICI : 201 au lieu de 21
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# --- VUE POUR GÉRER UN ARTICLE SPÉCIFIQUE DE LA LISTE D'ÉPICERIE ---
class ShoppingListItemView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, item_id, user):
        try:
            return ShoppingListItem.objects.get(id=item_id, user=user)
        except ShoppingListItem.DoesNotExist:
            raise status.HTTP_404_NOT_FOUND

    def put(self, request, item_id):
        item = self.get_object(item_id, request.user)
        serializer = ShoppingListItemSerializer(item, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, item_id):
        item = self.get_object(item_id, request.user)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- VUE POUR LA GESTION DES RECETTES (corrigée) ---
class RecipeView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        recipes = Recipe.objects.filter(user=request.user)
        serializer = RecipeSerializer(recipes, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = RecipeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            # LA CORRECTION EST ICI : 201 au lieu de 21
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# --- VUE POUR GÉRER UNE RECETTE SPÉCIFIQUE ---
class RecipeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, recipe_id, user):
        try:
            return Recipe.objects.get(id=recipe_id, user=user)
        except Recipe.DoesNotExist:
            raise status.HTTP_404_NOT_FOUND
            
    def put(self, request, recipe_id):
        recipe = self.get_object(recipe_id, request.user)
        serializer = RecipeSerializer(recipe, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, recipe_id):
        recipe = self.get_object(recipe_id, request.user)
        recipe.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- NOUVELLES VUES POUR LA CONTRIBUTION ---

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_products(request):
    """
    Recherche des produits dans le catalogue global.
    Utilisation: /api/products/search/?q=lait
    """
    query = request.query_params.get('q', None)
    if query:
        # Recherche simple qui regarde si le nom ou la marque contient la requête
        produits = Produit.objects.filter(nom__icontains=query) | Produit.objects.filter(marque__icontains=query)
        serializer = ProduitSerializer(produits, many=True)
        return Response(serializer.data)
    return Response([], status=status.HTTP_200_OK)


class ProductView(APIView):
    """
    API pour créer un nouveau produit dans le catalogue global.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """ Crée un nouveau produit s'il n'existe pas déjà. """
        serializer = ProduitSerializer(data=request.data)
        if serializer.is_valid():
            # Vérifier si un produit similaire existe déjà pour éviter les doublons
            nom = serializer.validated_data.get('nom')
            marque = serializer.validated_data.get('marque')
            if Produit.objects.filter(nom__iexact=nom, marque__iexact=marque).exists():
                return Response({'error': 'Ce produit existe déjà.'}, status=status.HTTP_409_CONFLICT)
            
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PriceSubmissionView(APIView):
    """
    API pour soumettre un nouveau prix.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """ Crée une nouvelle entrée de prix pour un produit dans un commerce. """
        serializer = PrixSubmissionSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Prix soumis avec succès !'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_deal(request):
    """
    Permet à un utilisateur de soumettre un seul rabais via un formulaire simple.
    La vue gère la création du produit et de la circulaire si nécessaire.
    """
    data = request.data
    
    # --- Validation des données requises ---
    required_fields = ['product_name', 'commerce_id', 'price_details', 'single_price', 'date_debut', 'date_fin']
    if not all(field in data for field in required_fields):
        return Response({'error': 'Tous les champs sont requis.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # --- 1. Gérer le Produit ---
        product_name = data['product_name'].strip()
        brand = data.get('brand', '').strip()
        
        # On cherche le produit. S'il n'existe pas, on le crée.
        produit_obj, _ = Produit.objects.get_or_create(
            nom__iexact=product_name, 
            marque__iexact=brand,
            defaults={'nom': product_name, 'marque': brand}
        )

        # --- 2. Gérer le Commerce ---
        commerce_id = data['commerce_id']
        commerce_obj = get_object_or_404(Commerce, id=commerce_id)

        # --- 3. Gérer la Circulaire ---
        date_debut = datetime.strptime(data['date_debut'], '%Y-%m-%d').date()
        date_fin = datetime.strptime(data['date_fin'], '%Y-%m-%d').date()

        # On cherche une circulaire pour ce magasin et ces dates. Si elle n'existe pas, on la crée.
        circulaire_obj, _ = Circulaire.objects.get_or_create(
            commerce=commerce_obj,
            date_debut=date_debut,
            date_fin=date_fin
        )

        # --- 4. Créer le Prix (le rabais) ---
        Prix.objects.create(
            produit=produit_obj,
            commerce=commerce_obj,
            circulaire=circulaire_obj,
            prix=data['single_price'],
            details_prix=data['price_details'],
            submitted_by=request.user # On associe la soumission à l'utilisateur
        )
        
        return Response({'message': 'Rabais soumis avec succès !'}, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

# --- VERSION CORRIGÉE DE LA VUE POUR LA CONFIRMATION DE PRIX ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_price(request, price_id):
    """
    Permet à un utilisateur de confirmer un prix soumis par un autre utilisateur
    et augmente la réputation du soumissionnaire original.
    """
    price_entry = get_object_or_404(Prix, id=price_id)
    user = request.user

    if price_entry.submitted_by == user:
        return Response(
            {'error': 'Vous ne pouvez pas confirmer votre propre soumission de prix.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if price_entry.confirmations.filter(id=user.id).exists():
        return Response(
            {'message': 'Vous avez déjà confirmé ce prix.'},
            status=status.HTTP_200_OK
        )

    price_entry.confirmations.add(user)
    
    # --- DÉBUT DE LA LOGIQUE DE RÉPUTATION (CORRIGÉE ET ROBUSTE) ---
    # On vérifie si un utilisateur a soumis ce prix
    if price_entry.submitted_by:
        # On utilise get_or_create pour éviter une erreur si le profil n'existe pas
        submitter_profile, created = Profile.objects.get_or_create(user=price_entry.submitted_by)
        # On augmente sa réputation de 5 points
        submitter_profile.reputation += 5
        submitter_profile.save()
    # --- FIN DE LA LOGIQUE DE RÉPUTATION ---
    
    return Response(
        {'status': 'succès', 'message': 'Prix confirmé avec succès !'},
        status=status.HTTP_200_OK
    )

# --- NOUVELLE VUE POUR LE SIGNALEMENT DE PRIX ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_price(request, price_id):
    """
    Permet à un utilisateur de signaler une entrée de prix.
    """
    price_entry = get_object_or_404(Prix, id=price_id)
    user = request.user
    
    # On récupère la raison du signalement depuis le corps de la requête
    reason = request.data.get('reason')
    comments = request.data.get('comments', '')

    if not reason:
        return Response({'error': 'Une raison pour le signalement est requise.'}, status=status.HTTP_400_BAD_REQUEST)
        
    # Vérifie si l'utilisateur a déjà signalé ce prix
    if Report.objects.filter(price_entry=price_entry, reported_by=user).exists():
        return Response({'message': 'Vous avez déjà signalé ce prix.'}, status=status.HTTP_200_OK)

    # Crée le signalement
    Report.objects.create(
        price_entry=price_entry,
        reported_by=user,
        reason=reason,
        comments=comments
    )
    
    return Response({'status': 'succès', 'message': 'Le prix a été signalé. Merci de votre contribution !'}, status=status.HTTP_201_CREATED)


@staff_member_required
def data_management_view(request):
    """
    Affiche la page principale de gestion des données.
    """
    context = {
        'title': 'Gestion Avancée des Données',
        'has_permission': request.user.is_superuser,
    }
    # On ajoute le contexte de l'admin pour que le template fonctionne correctement
    context.update(admin.site.each_context(request))
    return TemplateResponse(request, 'admin/data_management.html', context)

@staff_member_required
def reset_flyers_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        prix_count, _ = Prix.objects.filter(circulaire__isnull=False).delete()
        circulaire_count, _ = Circulaire.objects.all().delete()
        messages.success(request, f'{circulaire_count} circulaires et {prix_count} prix associés ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')

@staff_member_required
def reset_community_prices_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        count, _ = Prix.objects.filter(circulaire__isnull=True).delete()
        messages.success(request, f'{count} prix communautaires ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')

@staff_member_required
def reset_users_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        count, _ = User.objects.filter(is_superuser=False).delete()
        messages.success(request, f'{count} utilisateurs (non-administrateurs) ont été supprimés.')
    return HttpResponseRedirect('/admin/data-management/')

@staff_member_required
def reset_all_data_view(request):
    if request.method == 'POST' and request.user.is_superuser:
        Report.objects.all().delete()
        Prix.objects.all().delete()
        Circulaire.objects.all().delete()
        InventoryItem.objects.all().delete()
        ShoppingListItem.objects.all().delete()
        Recipe.objects.all().delete()
        Produit.objects.all().delete()
        Commerce.objects.all().delete()
        Categorie.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()
        messages.warning(request, 'La base de données a été entièrement réinitialisée (sauf les comptes administrateurs).')
    return HttpResponseRedirect('/admin/data-management/')

# --- FIN DES AJOUTS POUR LA GESTION ADMIN ---
