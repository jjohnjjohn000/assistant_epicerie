# Fichier : core/migrations/0012_migrate_inventory_categories.py

from django.db import migrations, models
import django.db.models.deletion

def migrate_category_data(apps, schema_editor):
    """
    Crée les nouvelles catégories à partir des anciennes données textuelles
    et met à jour les articles d'inventaire.
    """
    InventoryItem = apps.get_model('core', 'InventoryItem')
    InventoryCategory = apps.get_model('core', 'InventoryCategory')
    User = apps.get_model('auth', 'User')

    # Dictionnaire pour suivre les catégories créées pour chaque utilisateur
    user_categories = {}

    # On parcourt tous les articles d'inventaire existants
    for item in InventoryItem.objects.all():
        old_category_name = item.category # C'est encore du texte à ce stade
        user = item.user

        if not old_category_name:
            continue

        # Si nous n'avons pas encore traité de catégorie pour cet utilisateur, on initialise son dictionnaire
        if user.id not in user_categories:
            user_categories[user.id] = {}

        # On vérifie si on a déjà créé cette catégorie pour cet utilisateur
        if old_category_name not in user_categories[user.id]:
            # Si non, on la crée et on la stocke
            new_category, _ = InventoryCategory.objects.get_or_create(
                user=user,
                name=old_category_name
            )
            user_categories[user.id][old_category_name] = new_category
        
        # On récupère la catégorie nouvellement créée
        new_category_obj = user_categories[user.id][old_category_name]

        # On met à jour l'article d'inventaire pour qu'il pointe vers le bon ID de catégorie
        item.category = new_category_obj.id
        item.save(update_fields=['category'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_remove_profile_inventory_layout_profile_layouts'), # Assurez-vous que c'est bien votre dernière migration correcte
    ]

    operations = [
        # Étape 1: Créer le nouveau modèle pour les catégories
        migrations.CreateModel(
            name='InventoryCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='inventory_categories', to='auth.user')),
            ],
            options={
                'verbose_name': "Catégorie d'inventaire",
                'verbose_name_plural': "Catégories d'inventaire",
                'ordering': ['name'],
                'unique_together': {('user', 'name')},
            },
        ),
        
        # Étape 2: Exécuter notre script Python pour migrer les données
        migrations.RunPython(migrate_category_data, reverse_code=migrations.RunPython.noop),

        # Étape 3: Modifier le champ de InventoryItem pour qu'il soit une vraie ForeignKey
        migrations.AlterField(
            model_name='inventoryitem',
            name='category',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='items', to='core.inventorycategory'),
        ),
        
        # Étape 4: Mettre à jour l'ordre par défaut du modèle InventoryItem
        migrations.AlterModelOptions(
            name='inventoryitem',
            options={'ordering': ['category__name', 'name']},
        ),
    ]