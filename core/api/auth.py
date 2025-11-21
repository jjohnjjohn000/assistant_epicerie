from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from rest_framework.authtoken.models import Token
from core.models import Profile # Si besoin


@api_view(['POST'])
@permission_classes([AllowAny])
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
@permission_classes([AllowAny])
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
        logout(request)
        login(request, user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'username': user.username})
    else:
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
    except (AttributeError, Token.DoesNotExist):
        # Gère le cas où il n'y a pas de jeton, sans faire planter la vue
        pass

    # Détruit la session Django active pour cet utilisateur
    logout(request)

    return Response({'message': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
