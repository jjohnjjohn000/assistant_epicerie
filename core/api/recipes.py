from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from core.models import Recipe
from core.serializers import RecipeSerializer


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
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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
