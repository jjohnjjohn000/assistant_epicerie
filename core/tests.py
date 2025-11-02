# Fichier: core/tests.py

from django.test import TestCase
from django.urls import reverse
from .models import Commerce

class CoreAPITests(TestCase):

    def setUp(self):
        """Cette méthode est exécutée avant chaque test."""
        Commerce.objects.create(nom="Test Supermarché", adresse="123 Rue Fictive")

    def test_get_commerces_endpoint(self):
        """Vérifie que l'endpoint pour lister les commerces fonctionne."""
        
        url = reverse('api_get_commerces')
        response = self.client.get(url)
        
        # 1. Toujours vérifier que la requête a réussi (code de statut 200 OK)
        self.assertEqual(response.status_code, 200)
        
        # --- DÉBUT DES MODIFICATIONS ---
        
        # 2. Décoder la réponse JSON en une structure de données Python (une liste de dictionnaires)
        data = response.json()
        
        # 3. Vérifier que la réponse est bien une liste et qu'elle contient un seul élément
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1)
        
        # 4. Vérifier la valeur de la clé 'nom' dans le premier dictionnaire de la liste.
        #    Ceci compare les chaînes Python, qui gèrent correctement les caractères Unicode.
        self.assertEqual(data[0]['nom'], "Test Supermarché")
        
        # --- FIN DES MODIFICATIONS ---
        
        # On peut toujours vérifier le type de contenu si on le souhaite
        self.assertEqual(response['Content-Type'], 'application/json')
