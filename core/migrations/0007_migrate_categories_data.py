from django.db import migrations, models  # <-- ASSUREZ-VOUS QUE 'models' EST ICI
import django.db.models.deletion # <-- C'est une bonne pratique de l'ajouter aussi

def transfer_categories(apps, schema_editor):
    Produit = apps.get_model('core', 'Produit')
    Categorie = apps.get_model('core', 'Categorie')
    
    for produit in Produit.objects.all():
        if produit.categorie_old: # `categorie_old` est le nom temporaire de l'ancien champ
            categorie_obj, created = Categorie.objects.get_or_create(nom=produit.categorie_old)
            produit.categorie_new = categorie_obj # `categorie_new` est le nom du nouveau champ
            produit.save()

class Migration(migrations.Migration):
    
    dependencies = [
        ('core', '0006_categorie_alter_produit_categorie'), # Remplacez par le nom de la migration précédente
    ]

    operations = [
        # Temporairement, renommer l'ancien champ pour y accéder
        migrations.RenameField(
            model_name='produit',
            old_name='categorie',
            new_name='categorie_old',
        ),
        # Ajouter le nouveau champ ForeignKey
        migrations.AddField(
	    model_name='produit',
	    name='categorie', # L'argument s'appelle 'name'
	    field=models.ForeignKey(
		blank=True, 
		help_text='Catégorie du produit', 
		null=True, 
		on_delete=django.db.models.deletion.SET_NULL, 
		to='core.categorie'
	    ),
	    preserve_default=False,
	),
        # Exécuter notre code de transfert
        migrations.RunPython(transfer_categories),
        # Supprimer l'ancien champ
        migrations.RemoveField(
            model_name='produit',
            name='categorie_old',
        ),
    ]
