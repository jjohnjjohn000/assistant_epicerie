from django.db import models

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


class Produit(models.Model):
    """
    Représente un produit générique, indépendamment du magasin où il est vendu.
    """
    nom = models.CharField(max_length=255, help_text="Nom complet du produit (ex: Lait 2% Natrel)")
    marque = models.CharField(max_length=100, blank=True, null=True, help_text="La marque du produit (ex: Natrel)")
    # Plus tard, on pourrait faire de 'catégorie' son propre modèle avec une clé étrangère
    categorie = models.CharField(max_length=100, blank=True, null=True, help_text="Catégorie du produit (ex: Produits Laitiers, Fruits et Légumes)")
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
    # Un prix peut exister sans circulaire (prix régulier), donc on autorise ce champ à être vide.
    circulaire = models.ForeignKey(Circulaire, on_delete=models.SET_NULL, null=True, blank=True, related_name="prix")
    
    # On utilise DecimalField pour les prix afin d'éviter les erreurs d'arrondi.
    # max_digits=10 permet des prix jusqu'à 99,999,999.99$
    # decimal_places=2 assure qu'on a toujours deux chiffres après la virgule.
    prix = models.DecimalField(max_digits=10, decimal_places=2, help_text="Le prix de l'article")
    details_prix = models.CharField(max_length=100, blank=True, null=True, help_text="Détails additionnels (ex: '2 pour 5.00$', 'par livre')")
    
    # La date est automatiquement mise à jour à chaque modification.
    date_mise_a_jour = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.produit.nom} chez {self.commerce.nom} - {self.prix}$"
    
    class Meta:
        verbose_name = "Prix"
        verbose_name_plural = "Prix"
