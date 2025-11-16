# Fichier: core/models.py

from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.validators import MinValueValidator

# Create your models here.

class Commerce(models.Model):
    """
    Représente un magasin ou une épicerie.
    """
    nom = models.CharField(max_length=200, unique=True, help_text="Le nom du magasin (ex: IGA, Metro, Maxi)")
    adresse = models.TextField(blank=True, null=True, help_text="L'adresse physique du magasin")
    site_web = models.URLField(blank=True, null=True, help_text="L'URL du site web du magasin")
    
    # Cette fonction spéciale permet d'afficher un nom lisible dans l'interface d'admin
    def __str__(self):
        return self.nom

    class Meta:
        verbose_name = "Commerce"
        verbose_name_plural = "Commerces"

class Categorie(models.Model):
    nom = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.nom

    class Meta:
        verbose_name = "Catégorie"
        verbose_name_plural = "Catégories"

class Produit(models.Model):
    """
    Représente un produit générique, indépendamment du magasin où il est vendu.
    """
    nom = models.CharField(max_length=255, help_text="Nom complet du produit (ex: Lait 2% Natrel)")
    marque = models.CharField(max_length=100, blank=True, null=True, help_text="La marque du produit (ex: Natrel)")
    # Plus tard, on pourrait faire de 'catégorie' son propre modèle avec une clé étrangère
    categorie = models.ForeignKey(Categorie, on_delete=models.SET_NULL, null=True, blank=True, help_text="Catégorie du produit")
    code_barres = models.CharField(max_length=50, blank=True, null=True, unique=True, help_text="Le code-barres UPC du produit")

    def __str__(self):
        if self.marque:
            return f"{self.marque} - {self.nom}"
        return self.nom
    
    class Meta:
        verbose_name = "Produit"
        verbose_name_plural = "Produits"

class Circulaire(models.Model):
    """
    Représente une circulaire pour un commerce, avec une période de validité.
    """
    commerce = models.ForeignKey(Commerce, on_delete=models.CASCADE, help_text="Le commerce associé à cette circulaire")
    date_debut = models.DateField(help_text="Date de début de validité de la circulaire")
    date_fin = models.DateField(help_text="Date de fin de validité de la circulaire")
    
    def __str__(self):
        return f"Circulaire pour {self.commerce.nom} ({self.date_debut} au {self.date_fin})"
    
    class Meta:
        verbose_name = "Circulaire"
        verbose_name_plural = "Circulaires"

class Prix(models.Model):
    """
    Le prix d'un produit spécifique dans un commerce, potentiellement lié à une circulaire.
    """
    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name="prix")
    commerce = models.ForeignKey(Commerce, on_delete=models.CASCADE, related_name="prix")
    circulaire = models.ForeignKey(Circulaire, on_delete=models.SET_NULL, null=True, blank=True, related_name="prix")
    
    prix = models.DecimalField(max_digits=10, decimal_places=2, help_text="Le prix de l'article")
    details_prix = models.CharField(max_length=100, blank=True, null=True, help_text="Détails additionnels (ex: '2 pour 5.00$', 'par livre')")
    
    submitted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="submitted_prices")
    
    confirmations = models.ManyToManyField(User, related_name="confirmed_prices", blank=True)
    
    date_mise_a_jour = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.produit.nom} chez {self.commerce.nom} - {self.prix}$"
    
    class Meta:
        verbose_name = "Prix"
        verbose_name_plural = "Prix"

class Profile(models.Model):
    """ Modèle pour étendre les fonctionnalités du modèle User de base. """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    reputation = models.IntegerField(default=0, help_text="Points de réputation de l'utilisateur")
    layouts = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Profil de {self.user.username}"

@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    """
    Crée un profil pour un nouvel utilisateur OU s'assure qu'un profil
    existe pour un utilisateur plus ancien qui n'en aurait pas.
    """
    if created:
        Profile.objects.create(user=instance)
    # Pour les utilisateurs existants, on s'assure que leur profil existe aussi
    # get_or_create est la méthode la plus sûre ici.
    Profile.objects.get_or_create(user=instance)

# --- NOUVEAU MODÈLE POUR LES SIGNALEMENTS ---
class Report(models.Model):
    """ Modèle pour que les utilisateurs puissent signaler des données incorrectes. """
    
    # On définit les choix possibles pour le statut et la raison
    REPORT_STATUS_CHOICES = [
        ('PENDING', 'En attente'),
        ('REVIEWED', 'Examiné'),
        ('RESOLVED', 'Résolu'),
    ]
    REPORT_REASON_CHOICES = [
        ('INCORRECT_PRICE', 'Prix incorrect'),
        ('WRONG_PRODUCT', 'Mauvais produit/commerce'),
        ('EXPIRED_DEAL', 'Rabais expiré'),
        ('OTHER', 'Autre'),
    ]
    
    price_entry = models.ForeignKey(Prix, on_delete=models.CASCADE, related_name="reports")
    reported_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_made")
    reason = models.CharField(max_length=50, choices=REPORT_REASON_CHOICES)
    comments = models.TextField(blank=True, null=True, help_text="Commentaires additionnels (optionnel)")
    status = models.CharField(max_length=20, choices=REPORT_STATUS_CHOICES, default='PENDING')
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Signalement pour '{self.price_entry}' par {self.reported_by.username}"

    class Meta:
        # Un utilisateur ne peut signaler le même prix qu'une seule fois
        unique_together = ('price_entry', 'reported_by')

# --- NOUVEAU MODÈLE POUR L'INVENTAIRE ---
class InventoryCategory(models.Model):
    """ Représente une catégorie d'inventaire personnalisée pour un utilisateur. """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="inventory_categories")
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

    class Meta:
        # Un utilisateur ne peut pas avoir deux catégories avec le même nom
        unique_together = ('user', 'name')
        ordering = ['name']
        verbose_name = "Catégorie d'inventaire"
        verbose_name_plural = "Catégories d'inventaire"


class InventoryItem(models.Model):
    """ Représente un article dans l'inventaire personnel d'un utilisateur. """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="inventory_items")
    name = models.CharField(max_length=200)
    quantity = models.CharField(max_length=50, default="1")
    
    # On remplace le CharField par une clé étrangère vers les catégories de l'utilisateur
    category = models.ForeignKey(InventoryCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="items")

    alert_threshold = models.IntegerField(default=2, validators=[MinValueValidator(0)])
    date_added = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.quantity}) pour {self.user.username}"

    class Meta:
        unique_together = ('user', 'name')
        ordering = ['category__name', 'name']
        
# --- NOUVEAU MODÈLE POUR LA LISTE D'ÉPICERIE ---
class ShoppingListItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="shopping_list_items")
    name = models.CharField(max_length=200)
    quantity = models.CharField(max_length=50, default="1")
    is_checked = models.BooleanField(default=False) # Ajout pratique pour le futur
    date_added = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.quantity}) pour {self.user.username}"

    class Meta:
        ordering = ['date_added']


# --- NOUVEAU MODÈLE POUR LES RECETTES ---
class Recipe(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="recipes")
    name = models.CharField(max_length=255)
    ingredients = models.TextField()
    instructions = models.TextField()
    comments = models.TextField(blank=True, null=True)
    date_created = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Recette '{self.name}' pour {self.user.username}"
        
    class Meta:
        ordering = ['name']