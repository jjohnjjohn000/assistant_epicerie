from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db import transaction, models
from django.db.models import F
from core.models import InventoryItem, ShoppingListItem, InventoryCategory, Profile
from core.serializers import InventoryItemSerializer, ShoppingListItemSerializer, InventoryCategorySerializer


class InventoryCategoryView(APIView):
    """ API pour gérer les catégories d'inventaire de l'utilisateur. """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """ Retourne la liste des catégories de l'utilisateur connecté. """
        categories = InventoryCategory.objects.filter(user=request.user)
        serializer = InventoryCategorySerializer(categories, many=True)
        return Response(serializer.data)

    def post(self, request):
        """ Crée une nouvelle catégorie pour l'utilisateur. """
        serializer = InventoryCategorySerializer(data=request.data)
        if serializer.is_valid():
            # Vérifie si la catégorie existe déjà pour cet utilisateur
            if InventoryCategory.objects.filter(user=request.user, name__iexact=serializer.validated_data['name']).exists():
                return Response({'error': 'Cette catégorie existe déjà.'}, status=status.HTTP_409_CONFLICT)
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, category_id):
        """ Supprime une catégorie de l'utilisateur. """
        category = get_object_or_404(InventoryCategory, id=category_id, user=request.user)
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InventoryView(APIView):
    """
    API pour gérer l'inventaire de l'utilisateur connecté.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # DÉBUT DE LA CORRECTION
        # On trie d'abord par catégorie (en mettant les articles sans catégorie à la fin),
        # puis par l'ordre personnalisé à l'intérieur de chaque catégorie.
        items = InventoryItem.objects.filter(user=request.user) \
                                     .select_related('category') \
                                     .order_by(F('category_id').asc(nulls_last=True), 'order')
        # FIN DE LA CORRECTION
        serializer = InventoryItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        serializer = InventoryItemSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            # LOGIQUE AJOUTÉE pour définir l'ordre à la création
            category = serializer.validated_data.get('category')
            last_item_order = InventoryItem.objects.filter(
                user=request.user, 
                category=category
            ).aggregate(max_order=models.Max('order'))['max_order']
            
            new_order = 0
            if last_item_order is not None:
                new_order = last_item_order + 1
            
            serializer.save(user=request.user, order=new_order)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, item_id):
        item = get_object_or_404(InventoryItem, id=item_id, user=request.user)
        # On passe aussi le contexte ici
        serializer = InventoryItemSerializer(item, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, item_id):
        item = get_object_or_404(InventoryItem, id=item_id, user=request.user)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
            

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def reorder_inventory(request):
    """
    Réorganise les articles d'inventaire en fonction d'une liste d'IDs ordonnée
    et met à jour leur catégorie si nécessaire.
    """
    data = request.data
    ordered_ids = data.get('ordered_ids')
    target_category_id = data.get('category_id')

    if not isinstance(ordered_ids, list):
        return Response({'error': 'ordered_ids doit être une liste.'}, status=status.HTTP_400_BAD_REQUEST)

    target_category = None
    if target_category_id:
        target_category = get_object_or_404(InventoryCategory, id=target_category_id, user=request.user)

    for index, item_id in enumerate(ordered_ids):
        item = get_object_or_404(InventoryItem.objects.select_for_update(), id=item_id, user=request.user)
        item.order = index
        item.category = target_category
        item.save()

    return Response({'status': 'succès'}, status=status.HTTP_200_OK)


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

        category_obj = None
        # On récupère le nom de la catégorie depuis les données JSON importées
        category_name_from_data = item_data.get('category') 
        if category_name_from_data:
            # On cherche ou on crée la catégorie pour l'utilisateur
            category_obj, _ = InventoryCategory.objects.get_or_create(
                user=request.user, 
                name=category_name_from_data
            )

        # update_or_create est parfait pour ça :
        # Il cherche un article avec ce nom pour cet utilisateur.
        # S'il le trouve, il le met à jour. Sinon, il le crée.
        obj, created = InventoryItem.objects.update_or_create(
            user=request.user,
            name=item_name,
            defaults={
                'quantity': item_data.get('quantity', '1'),
                'category': category_obj,
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


class UserLayoutView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """ Récupère la disposition sauvegardée pour une page spécifique. """
        page_name = request.query_params.get('page')
        if not page_name:
            return Response({"error": "Le paramètre 'page' est manquant."}, status=status.HTTP_400_BAD_REQUEST)

        profile, _ = Profile.objects.get_or_create(user=request.user)
        # On récupère la disposition pour la page demandée depuis le dictionnaire 'layouts'.
        layout_data = profile.layouts.get(page_name, [])
        return Response(layout_data)

    def post(self, request):
        """ Sauvegarde la nouvelle disposition pour une page spécifique. """
        page_name = request.query_params.get('page')
        if not page_name:
            return Response({"error": "Le paramètre 'page' est manquant."}, status=status.HTTP_400_BAD_REQUEST)

        profile, _ = Profile.objects.get_or_create(user=request.user)
        # On met à jour la clé correspondant à la page dans le dictionnaire 'layouts'.
        profile.layouts[page_name] = request.data
        profile.save()
        return Response({"status": "success"}, status=status.HTTP_200_OK)