/**
 * Logique pour la page Assistant Épicerie
 * Gère l'inventaire, la liste d'épicerie et les recettes.
 */
document.addEventListener('DOMContentLoaded', function() {

    // --- PARTIE 1 : DÉCLARATION DES VARIABLES (SANS ACCÉDER AU DOM) ---
    let inventory = [];
    let shoppingList = [];
    let recipes = [];
    let grid;
    let draggedShoppingItemIndex = null;
    let draggedInventoryItemIndex = null;
    let draggedItemId = null;
    let userCategories = [];

    let inventoryDisplay, shoppingListDisplay, addItemForm, addShoppingItemForm, 
    generateRecipeBtn, generateShoppingListBtn, toggleAllCheckbox, 
    addLowStockItemsBtn, promptOutputSection, promptOutputTextarea, 
    copyPromptBtn, importShoppingListTextarea, importShoppingListBtn, 
    recipeListDisplay, showAddRecipeBtn, recipeFormModal, recipeViewModal, 
    closeRecipeFormBtn, closeRecipeViewBtn, recipeForm, recipeModalTitle, 
    copyRecipePromptBtn, importRecipeJsonBtn, viewOldInventoryBtn, 
    exportInventoryBtn, importInventoryBtn, inventoryFileInput, 
    viewOldDataModal, closeOldDataModalBtn, oldDataContent, autoArrangeBtn,
    reorganizeBtn, compactBtn, addCategoryBtn, smartArrangeBtn;

    // --- PARTIE 2 : FONCTIONS (ELLES NE S'EXÉCUTENT PAS ENCORE) ---
    
    async function loadUserCategories() {
        if (!localStorage.getItem('authToken')) return;
        try {
            userCategories = await apiCall('inventory/categories', 'GET');
            const categorySelect = document.getElementById('itemCategory');
            categorySelect.innerHTML = '<option value="">Aucune catégorie</option>'; // Option par défaut
            userCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur de chargement des catégories:", error);
        }
    }

    async function handleAddNewCategory() {
        const newCategoryName = prompt("Entrez le nom de la nouvelle catégorie :");
        if (newCategoryName && newCategoryName.trim() !== '') {
            try {
                await apiCall('inventory/categories', 'POST', { name: newCategoryName.trim() });
                await loadUserCategories(); // Recharger la liste
            } catch (error) {
                alert(`Erreur : ${error.message}`);
            }
        }
    }

    async function loadServerData() {
        const token = localStorage.getItem('authToken');
        //console.log("1. Tentative de chargement des données. Jeton trouvé:", token ? "Oui" : "Non");

        if (!token) {
            renderInventory(); renderShoppingList(); renderRecipeBook();
            return;
        }

        try {
            const [inv, sl, rec, layout, cats] = await Promise.all([
                apiCall('inventory', 'GET'),
                apiCall('shopping-list', 'GET'),
                apiCall('recipes', 'GET'),
                apiCall('user/layout?page=assistant', 'GET'),
                apiCall('inventory/categories', 'GET')
            ]);
            
            /*console.log("2. Données reçues du serveur:", { 
                inventory: inv, 
                shoppingList: sl, 
                recipes: rec 
            });*/

            inventory = inv.map(item => ({ ...item, include: true }));
            shoppingList = sl;
            recipes = rec;
            userCategories = cats;
            
            if (grid && layout && layout.length > 0) {
                //console.log("5. Application de la disposition Gridstack sauvegardée.");
                grid.batchUpdate();
                layout.forEach(savedItem => {
                    // GridStack sauvegarde l'ID (gs-id ou id) dans la propriété 'id' ou conserve la clé personnalisée si configuré
                    // On vérifie les deux cas possibles pour être robuste
                    const savedId = savedItem['gs-id'] || savedItem.id; 

                    if (savedId) {
                        // On cherche l'élément HTML correspondant
                        const widgetEl = document.querySelector(`.grid-stack-item[gs-id="${savedId}"]`);
                        
                        if (widgetEl) {
                            // Si trouvé, on met à jour sa position/taille sans toucher à son contenu HTML
                            grid.update(widgetEl, {
                                x: savedItem.x,
                                y: savedItem.y,
                                w: savedItem.w,
                                h: savedItem.h
                            });
                        }
                    }
                });

                grid.commit(); // Applique les changements
            }

            //console.log("3. Lancement du rendu des composants...");
            renderInventory();
            renderShoppingList();
            renderRecipeBook();
            //console.log("4. Rendu terminé.");

            // On peuple la liste déroulante après avoir récupéré les catégories
            const categorySelect = document.getElementById('itemCategory');
            categorySelect.innerHTML = '<option value="">Aucune catégorie</option>';
            userCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });

            attachStaticListeners();

        } catch (error) {
            console.error("ERREUR CRITIQUE lors du chargement des données:", error);
            if (String(error).includes('401') || String(error).includes('403')) {
                handleLogout();
            }
        }
    }
    function saveShoppingList() { localStorage.setItem('shoppingList', JSON.stringify(shoppingList)); }

    function initializeGrid() {
        // Initialise Gridstack et stocke l'instance dans la variable globale 'grid'.
        grid = GridStack.init({
            float: true,
            cellHeight: '70px',
            minRow: 1,
            draggable: {
                cancel: '#inventory-display, #shopping-list-display'
            }
        });

        // Attache l'événement de sauvegarde une seule fois, à la création.
        // Il se déclenchera à chaque fois que l'utilisateur déplace ou redimensionne un widget.
        grid.on('change', async function (event, items) {
            // On ne tente de sauvegarder que si l'utilisateur est connecté.
            if (localStorage.getItem('authToken')) {
                const serializedData = grid.save();
                try {
                    await apiCall('user/layout?page=assistant', 'POST', serializedData);
                } catch (error) {
                    console.error("Erreur de sauvegarde de la disposition:", error);
                }
            }
        });
    }

    // --- FONCTIONS DE RENDU ---
    function renderInventory() {
        const inventoryDisplay = document.getElementById('inventory-display');
        if (!inventoryDisplay) {
            console.error("ERREUR: 'inventoryDisplay' n'a pas été trouvé.");
            return;
        }

        inventoryDisplay.innerHTML = ''; // On vide l'affichage
        if (!localStorage.getItem('authToken')) {
            inventoryDisplay.innerHTML = "<p>Veuillez vous connecter pour voir votre inventaire.</p>";
            return;
        }

        // On groupe les items par catégorie pour le rendu
        const itemsByCategory = inventory.reduce((acc, item) => {
            const categoryId = item.category === null ? 'null_category' : item.category;
            if (!acc[categoryId]) {
                acc[categoryId] = { name: item.category_name || 'Sans catégorie', items: [] };
            }
            acc[categoryId].items.push(item);
            return acc;
        }, {});

        const sortedCategories = Object.keys(itemsByCategory).sort((a,b) => {
            if (a === 'null_category') return 1;
            if (b === 'null_category') return -1;
            return itemsByCategory[a].name.localeCompare(itemsByCategory[b].name);
        });

        sortedCategories.forEach(categoryId => {
            const categoryData = itemsByCategory[categoryId];
            const section = document.createElement('div');
            section.className = 'inventory-section';
            section.dataset.categoryId = categoryId;
            
            const title = document.createElement('h3');
            title.className = 'category-title';
            title.textContent = categoryData.name;
            section.appendChild(title);

            const list = document.createElement('ul');

            // ====================== DÉBUT DE LA CORRECTION ======================
            // On s'assure de trier les articles de chaque catégorie selon leur
            // champ 'order' avant de les afficher.
            categoryData.items.sort((a, b) => a.order - b.order).forEach(item => {
            // ======================= FIN DE LA CORRECTION =======================
                const index = inventory.findIndex(invItem => invItem.id === item.id);
                const li = document.createElement('li');
                li.dataset.itemId = item.id;
                li.dataset.index = index;
                li.draggable = true;
                
                let liClasses = 'inventory-item';
                const quantityValue = parseQuantity(item.quantity);
                if (item.alert_threshold && quantityValue < item.alert_threshold) {
                    liClasses += ' low-quantity-warning';
                }
                li.className = liClasses;

                // --- Construction robuste du contenu du <li> ---

                // 1. Section des détails (checkbox, nom)
                const itemDetails = document.createElement('div');
                itemDetails.className = 'item-details';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'include-item';
                checkbox.dataset.index = index;
                checkbox.checked = item.include;
                checkbox.style.marginRight = '10px';
                checkbox.style.transform = 'scale(1.2)';
                
                const itemNameSpan = document.createElement('span');
                itemNameSpan.className = 'inventory-item-name';
                // On ajoute le data-index ici pour corriger le bug de l'édition
                itemNameSpan.dataset.index = index; 
                itemNameSpan.textContent = item.name;

                itemDetails.appendChild(checkbox);
                itemDetails.appendChild(itemNameSpan);

                // 2. Section des contrôles (boutons, inputs)
                const itemControls = document.createElement('div');
                itemControls.className = 'item-controls';

                // Bouton Moins (Icône)
                const btnMinus = document.createElement('button');
                btnMinus.className = 'btn-icon btn-quantity-change';
                btnMinus.dataset.itemId = item.id;
                btnMinus.dataset.amount = '-1';
                btnMinus.innerHTML = '<i class="bi bi-dash-lg"></i>'; // Icône Bootstrap

                const quantityInput = document.createElement('input');
                quantityInput.type = 'text';
                quantityInput.value = item.quantity;
                quantityInput.dataset.itemId = item.id;
                quantityInput.className = 'item-quantity-input';

                // Bouton Plus (Icône)
                const btnPlus = document.createElement('button');
                btnPlus.className = 'btn-icon btn-quantity-change';
                btnPlus.dataset.itemId = item.id;
                btnPlus.dataset.amount = '1';
                btnPlus.innerHTML = '<i class="bi bi-plus-lg"></i>'; // Icône Bootstrap
                
                // Section Alerte (plus discrète)
                const alertWrapper = document.createElement('div');
                alertWrapper.style.display = 'flex';
                alertWrapper.style.alignItems = 'center';
                alertWrapper.style.marginLeft = '15px';
                alertWrapper.title = "Seuil d'alerte";
                
                const alertIcon = document.createElement('i');
                alertIcon.className = 'bi bi-bell text-muted';
                alertIcon.style.marginRight = '5px';
                alertIcon.style.fontSize = '0.9rem';

                const thresholdInput = document.createElement('input');
                thresholdInput.type = 'number';
                thresholdInput.value = item.alert_threshold !== null ? item.alert_threshold : 2;
                thresholdInput.dataset.itemId = item.id;
                thresholdInput.className = 'item-threshold-input';
                thresholdInput.min = '0';
                
                alertWrapper.appendChild(alertIcon);
                alertWrapper.appendChild(thresholdInput);
                
                // Bouton Supprimer (Poubelle rouge au survol)
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-icon delete'; // Nouvelle classe CSS
                deleteBtn.dataset.itemId = item.id;
                deleteBtn.style.marginLeft = '10px';
                deleteBtn.title = "Supprimer l'article";
                deleteBtn.innerHTML = '<i class="bi bi-trash"></i>'; // Icône Bootstrap

                // Ajout des contrôles
                itemControls.append(btnMinus, quantityInput, btnPlus, alertWrapper, deleteBtn);
                
                // 3. Ajout des deux sections principales au <li>
                li.appendChild(itemDetails);
                li.appendChild(itemControls);
                
                list.appendChild(li);
            });
            
            section.appendChild(list);
            inventoryDisplay.appendChild(section);
        });

        document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', deleteItem));
        document.querySelectorAll('.item-quantity-input').forEach(i => i.addEventListener('change', updateQuantity));
        document.querySelectorAll('.item-threshold-input').forEach(i => i.addEventListener('change', updateItemThreshold));
        document.querySelectorAll('.include-item').forEach(c => c.addEventListener('change', toggleInclusion));
        document.querySelectorAll('.btn-quantity-change').forEach(b => b.addEventListener('click', changeQuantity));
        document.querySelectorAll('.inventory-item-name').forEach(span => span.addEventListener('click', startEditInventoryItemName));

        updateToggleAllCheckboxState();
    }
    
    function renderShoppingList() {
        // SOLUTION : On récupère l'élément à chaque appel.
        const shoppingListDisplay = document.getElementById('shopping-list-display');

        //console.log("--- Exécution de renderShoppingList ---");
        //console.log("Element 'shoppingListDisplay' frais:", shoppingListDisplay); // DEBUG

        if (!shoppingListDisplay) {
            console.error("ERREUR: 'shoppingListDisplay' n'a pas été trouvé dans le DOM au moment du rendu.");
            return;
        }

        shoppingListDisplay.innerHTML = '';
        if (!localStorage.getItem('authToken')) {
            shoppingListDisplay.innerHTML = "<p>Connectez-vous pour gérer votre liste.</p>"; return;
        }
        if (shoppingList.length === 0) {
            shoppingListDisplay.innerHTML = "<p>Votre liste d'épicerie est vide.</p>"; return;
        }
        const list = document.createElement('ul');
        shoppingList.forEach(item => {
            const li = document.createElement('li');
            li.className = 'shopping-list-item'; li.dataset.itemId = item.id;
            li.innerHTML = `
                <div class="item-details"><span class="item-name">${item.name} (Qté: ${item.quantity})</span></div>
                <div class="shopping-item-controls">
                    <button class="btn btn-move" data-item-id="${item.id}">Ajouter à l'inventaire</button>
                    <button class="btn btn-delete-shopping" data-item-id="${item.id}">Supprimer</button>
                </div>`;
            list.appendChild(li);
        });
        shoppingListDisplay.appendChild(list);
        attachShoppingListListeners();
        //console.log("--- Fin de renderShoppingList ---");
    }

    function renderRecipeBook() {
        // SOLUTION : On récupère l'élément à chaque appel.
        const recipeListDisplay = document.getElementById('recipe-list-display');

        //console.log("--- Exécution de renderRecipeBook ---");
        //console.log("Element 'recipeListDisplay' frais:", recipeListDisplay); // DEBUG

        if (!recipeListDisplay) {
            console.error("ERREUR: 'recipeListDisplay' n'a pas été trouvé dans le DOM au moment du rendu.");
            return;
        }

        recipeListDisplay.innerHTML = '';
        if (!localStorage.getItem('authToken')) {
            recipeListDisplay.innerHTML = "<p>Connectez-vous pour voir vos recettes.</p>"; return;
        }
        if (recipes.length === 0) {
            recipeListDisplay.innerHTML = '<p>Aucune recette sauvegardée.</p>'; return;
        }
        recipes.forEach((recipe) => {
            const col = document.createElement('div');
            col.className = 'col';
            
            const card = document.createElement('div');
            card.className = 'card h-100 shadow-sm recipe-card';
            card.style.cursor = 'pointer';
            card.dataset.recipeId = recipe.id;
            
            card.innerHTML = `
                <div class="card-body">
                    <h5 class="card-title">${recipe.name}</h5>
                </div>
            `;
            card.addEventListener('click', () => viewRecipe(recipe.id));
            
            col.appendChild(card);
            recipeListDisplay.appendChild(col);
        });
        //console.log("--- Fin de renderRecipeBook ---");
    }

    async function addItem(e) {
        e.preventDefault();
        const categoryId = document.getElementById('itemCategory').value;
        const newItem = {
            name: document.getElementById('itemName').value.trim(),
            quantity: document.getElementById('itemQuantity').value.trim(),
            category: categoryId ? parseInt(categoryId, 10) : null,
            alert_threshold: 2
        };
        if (!newItem.name) return;

        try {
            const addedItem = await apiCall('inventory', 'POST', newItem);
            
            // --- AMÉLIORATION : Mettre à jour l'état local au lieu de tout recharger ---
            // La réponse de l'API (`addedItem`) contient maintenant le `category_name` grâce au serializer.
            inventory.push(addedItem); 
            renderInventory(); // On redessine juste l'inventaire, c'est instantané.
            
            addItemForm.reset();

        } catch (error) { 
            if (String(error).includes('UNIQUE constraint failed')) {
                alert("Erreur : L'article existe déjà dans votre inventaire.");
            } else {
                alert("Une erreur est survenue lors de l'ajout.");
            }
        }
    }

    async function deleteItem(e) {
        const itemId = e.currentTarget.dataset.itemId;
        if (!itemId) return;
        try {
            await apiCall(`inventory/${itemId}`, 'DELETE');
            inventory = inventory.filter(item => item.id != itemId);
            renderInventory();
        } catch (error) { console.error("Erreur de suppression:", error); }
    }

    async function updateItem(itemId, dataToUpdate) {
        try {
            const updatedItem = await apiCall(`inventory/${itemId}`, 'PUT', dataToUpdate);
            const index = inventory.findIndex(item => item.id == updatedItem.id);
            if (index !== -1) Object.assign(inventory[index], updatedItem);
            renderInventory();
        } catch (error) { console.error("Erreur de mise à jour:", error); }
    }

    function updateQuantity(e) { updateItem(e.target.dataset.itemId, { quantity: e.target.value }); }
    function updateItemThreshold(e) { updateItem(e.target.dataset.itemId, { alert_threshold: parseInt(e.target.value, 10) }); }

    async function changeQuantity(e) {
        const button = e.currentTarget;
        const itemId = button.dataset.itemId;
        const amount = parseInt(button.dataset.amount, 10);
        const itemIndex = inventory.findIndex(item => item.id == itemId);
        if (itemIndex === -1) return;
        let currentQuantity = parseQuantity(inventory[itemIndex].quantity);
        if (currentQuantity === Infinity || isNaN(currentQuantity)) {
            document.querySelector(`.item-quantity-input[data-item-id="${itemId}"]`).focus(); return;
        }
        const newQuantity = Math.max(0, currentQuantity + amount);
        await updateItem(itemId, { quantity: String(newQuantity) });
    }

    async function addShoppingItem(e) {
        e.preventDefault();
        const newItem = {
            name: document.getElementById('shoppingItemName').value.trim(),
            quantity: document.getElementById('shoppingItemQuantity').value.trim()
        };
        if (!newItem.name) return;
        try {
            const addedItem = await apiCall('shopping-list', 'POST', newItem);
            shoppingList.push(addedItem);
            renderShoppingList();
            addShoppingItemForm.reset();
        } catch (error) { console.error("Erreur ajout liste:", error); }
    }

    async function deleteShoppingItem(e) {
        const itemId = e.currentTarget.dataset.itemId;
        if (!itemId) return;
        try {
            await apiCall(`shopping-list/${itemId}`, 'DELETE');
            shoppingList = shoppingList.filter(item => item.id != itemId);
            renderShoppingList();
        } catch (error) { console.error("Erreur suppression liste:", error); }
    }

    async function moveItemToInventory(e) {
        const itemId = e.currentTarget.dataset.itemId;
        const itemToMove = shoppingList.find(item => item.id == itemId);
        if (!itemToMove) return;

        try {
            // --- DÉBUT DE LA CORRECTION ---
            // On envoie les données de l'article à l'inventaire SANS spécifier de catégorie.
            // Le backend assignera la catégorie par défaut ou la laissera nulle.
            // Le champ 'category' attend un ID, pas un nom. En ne l'envoyant pas, on évite l'erreur.
            const newItemData = { 
                name: itemToMove.name, 
                quantity: itemToMove.quantity 
                // Pas de 'category: "Épicerie"' ici !
            };
            
            // On ajoute d'abord à l'inventaire
            const addedToInventory = await apiCall('inventory', 'POST', newItemData);
            
            // Ensuite, on supprime de la liste d'épicerie
            await apiCall(`shopping-list/${itemId}`, 'DELETE');
            
            // On met à jour l'état local au lieu de tout recharger
            inventory.push(addedToInventory);
            shoppingList = shoppingList.filter(item => item.id != itemId);
            
            renderInventory();
            renderShoppingList();
            // --- FIN DE LA CORRECTION ---

        } catch (error) { 
            // Affiche une alerte plus utile si l'article existe déjà
            if (String(error).includes('UNIQUE constraint failed')) {
                alert("Erreur: Cet article existe déjà dans votre inventaire.");
            } else {
                alert("Une erreur est survenue lors du déplacement de l'article.");
            }
        }
    }

    async function handleRecipeFormSubmit(e) {
        e.preventDefault();
        const recipeData = {
            name: document.getElementById('recipe-name').value,
            ingredients: document.getElementById('recipe-ingredients').value,
            instructions: document.getElementById('recipe-instructions').value,
            comments: document.getElementById('recipe-comments').value,
        };
        const recipeId = document.getElementById('recipe-id').value;
        try {
            if (recipeId) await apiCall(`recipes/${recipeId}`, 'PUT', recipeData);
            else await apiCall('recipes', 'POST', recipeData);
            closeRecipeFormModal();
            await loadServerData();
        } catch (error) { console.error("Erreur sauvegarde recette:", error); }
    }

    async function deleteRecipe(recipeId) {
        if (confirm("Supprimer cette recette?")) {
            try {
                await apiCall(`recipes/${recipeId}`, 'DELETE');
                closeRecipeViewModal();
                await loadServerData();
            } catch (error) { console.error("Erreur suppression recette:", error); }
        }
    }

    function startEditInventoryItemName(e) {
        const span = e.target;
        const index = span.dataset.index;
        const currentName = inventory[index].name;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'edit-inventory-name';
        
        span.parentElement.replaceChild(input, span);
        input.focus();
        
        const save = () => {
            const newName = input.value.trim();
            if (newName) {
                inventory[index].name = newName;
                saveInventory();
            }
            renderInventory();
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                input.blur();
            } else if (evt.key === 'Escape') {
                renderInventory(); // Annule l'édition
            }
        });
    }            

    // --- FONCTIONS IA ET PROMPTS ---
    function displayPrompt(promptText) {
        promptOutputTextarea.value = promptText;
        promptOutputSection.style.display = 'block';
        promptOutputSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
        promptOutputTextarea.focus();
        promptOutputTextarea.select();
    }
    
    function generateRecipePrompt() {
        const includedItems = inventory.filter(item => item.include);
        const useFlyerDeals = document.getElementById('useFlyerDeals').checked;

        if (includedItems.length === 0 && !useFlyerDeals) {
            alert("Veuillez sélectionner au moins un ingrédient de votre inventaire ou cocher l'option pour utiliser les articles en rabais.");
            return;
        }

        const includeExtra = document.getElementById('includeExtraIngredients').checked;
        const noOven = document.getElementById('recipeCatNoOven').checked;
        const noCook = document.getElementById('recipeCatNoCook').checked;
        const quickMeal = document.getElementById('recipeCatQuick').checked;
        const ingredientNames = includedItems.map(item => item.name).join(', ');

        let promptText = 'Propose-moi une recette simple. ';
        if(includedItems.length > 0) { promptText += `Voici les ingrédients que je possède : ${ingredientNames}. `; }

        if (useFlyerDeals) {
            const flyerData = JSON.parse(localStorage.getItem('flyerData')) || {};
            const flyerItems = new Set();
            Object.values(flyerData).forEach(itemList => {
                itemList.forEach(item => {
                    const cleanName = item.name.split(/, | \/ | \(/)[0].trim();
                    if(cleanName) flyerItems.add(cleanName);
                });
            });
            if (flyerItems.size > 0) { promptText += `Je souhaite aussi utiliser des articles en rabais cette semaine. Voici quelques exemples : ${[...flyerItems].join(', ')}. `; }
        }

        if (includeExtra) { 
            promptText += `Tu peux suggérer 1 ou 2 ingrédients de base supplémentaires à acheter pour compléter la recette. `;
        } else { 
            promptText += `Essaie de créer une recette qui utilise UNIQUEMENT les ingrédients mentionnés (ceux de mon inventaire et/ou ceux en rabais). `; 
        }
        
        let cookingConstraints = [];
        if (noCook) {
            cookingConstraints.push("ne nécessite aucune cuisson (pas de four, pas de cuisinière)");
        } else if (noOven) {
            cookingConstraints.push("n'utilise que la cuisinière (les ronds), pas le four");
        }
        
        if (quickMeal) {
            cookingConstraints.push("doit pouvoir être préparée en moins de 30 minutes");
        }

        if (cookingConstraints.length > 0) {
            promptText += `La recette doit respecter les contraintes suivantes : ${cookingConstraints.join(' et ')}. `;
        }

        promptText += "Présente la recette avec la liste complète des ingrédients (en indiquant clairement lesquels je dois acheter) et les instructions.";
        displayPrompt(promptText);
    }

    function generateShoppingListPrompt() {
        const numPeople = document.getElementById('numPeople').value;
        const mealsList = document.getElementById('mealsList').value.trim();
        if (mealsList === '') { alert("Veuillez entrer au moins un repas à préparer."); return; }
        if (parseInt(numPeople, 10) < 1) { alert("Veuillez entrer un nombre de personnes valide."); return; }
        const currentInventory = inventory.map(item => `${item.name} (${item.quantity})`).join(', ');
        const promptText = `Agis comme un assistant de liste d'épicerie. Je veux préparer les repas suivants pour ${numPeople} personne(s) :\n\n${mealsList}\n\nVoici les ingrédients que je possède déjà dans mon inventaire :\n${currentInventory}\n\nCrée une liste d'épicerie qui contient uniquement les ingrédients manquants. Fournis la réponse sous forme de tableau JSON. Chaque objet doit avoir une clé "name" (string) et "quantity" (string). N'ajoute aucun texte avant ou après le tableau JSON.\n\nExemple de format attendu:\n[{"name": "Oignons", "quantity": "2"}, {"name": "Ail", "quantity": "1 tête"}]`;
        displayPrompt(promptText);
    }

    function importRecipeDataFromJson() {
        const jsonString = document.getElementById('recipe-json-input').value.trim();
            if (jsonString === '') { alert("Veuillez coller le texte JSON dans la zone prévue."); return; }
        try {
            const recipeData = JSON.parse(jsonString);
            const { name, ingredients, instructions, comments } = recipeData;
            
            if (!name || !ingredients || !instructions) {
                    throw new Error("Le JSON est incomplet. Les clés 'name', 'ingredients', et 'instructions' sont requises.");
            }
            
            document.getElementById('recipe-name').value = name || '';
            document.getElementById('recipe-ingredients').value = ingredients || '';
            document.getElementById('recipe-instructions').value = instructions || '';
            document.getElementById('recipe-comments').value = comments || '';

            alert("Les champs ont été remplis avec succès !");

        } catch (error) {
            alert("Erreur lors de l'importation : " + error.message);
            console.error("Erreur de parsing JSON pour recette:", error);
        }
    }

    function importShoppingListData() {
        const jsonString = importShoppingListTextarea.value.trim();
        if (jsonString === '') { alert("Veuillez coller le texte JSON dans la zone prévue."); return; }
        try {
            const itemsToImport = JSON.parse(jsonString);
            if (!Array.isArray(itemsToImport)) { throw new Error("Le JSON doit être un tableau (Array)."); }
            const validItems = itemsToImport.filter(item => item && typeof item.name === 'string' && typeof item.quantity === 'string');
            if (validItems.length !== itemsToImport.length) { alert("Certains objets dans le JSON sont mal formatés. Chaque objet doit avoir des clés 'name' et 'quantity'."); }
            shoppingList.push(...validItems);
            saveShoppingList(); renderShoppingList();
            importShoppingListTextarea.value = '';
            alert(`${validItems.length} article(s) importé(s) avec succès !`);
        } catch (error) {
            alert("Erreur lors de l'importation. Veuillez vérifier que le texte est un JSON valide et correspond au format attendu.");
            console.error("Erreur de parsing JSON:", error);
        }
    }
    
    function addLowStockItemsToShoppingList() {
        const lowStockItems = inventory.filter(item => {
            const quantity = parseQuantity(item.quantity);
            // Assurez-vous d'utiliser le bon nom de champ de l'API: alert_threshold
            return item.alert_threshold && quantity < item.alert_threshold;
        });

        if (lowStockItems.length === 0) {
            alert("Aucun article n'est actuellement en pénurie selon vos seuils d'alerte.");
            return;
        }

        let itemsToAddPromises = [];
        let itemsSkippedCount = 0;

        lowStockItems.forEach(lowItem => {
            // Vérifie si l'article est déjà dans la liste d'épicerie (côté client)
            const alreadyInList = shoppingList.some(shopItem => shopItem.name.trim().toLowerCase() === lowItem.name.trim().toLowerCase());
            
            if (!alreadyInList) {
                const newItem = {
                    name: lowItem.name,
                    quantity: '1' // Quantité par défaut à ajouter
                };
                // On prépare l'appel API mais on ne l'attend pas encore
                itemsToAddPromises.push(apiCall('shopping-list', 'POST', newItem));
            } else {
                itemsSkippedCount++;
            }
        });

        if (itemsToAddPromises.length === 0) {
            alert("Tous les articles en pénurie sont déjà dans votre liste d'épicerie.");
            return;
        }

        // On exécute tous les appels API en parallèle
        Promise.all(itemsToAddPromises)
            .then(results => {
                alert(`${results.length} article(s) en pénurie ont été ajouté(s) à votre liste d'épicerie.`);
                // On recharge les données du serveur pour être sûr que tout est à jour
                loadServerData();
            })
            .catch(error => {
                console.error("Erreur lors de l'ajout d'articles en pénurie:", error);
                alert("Une erreur est survenue lors de l'ajout des articles.");
            });
    }

    // --- FONCTIONS DE GESTION DES ANCIENNES DONNÉES ---
    function viewOldInventory() {
        // La clé 'inventory' est celle que nous utilisions avant la migration
        const oldInventoryData = JSON.parse(localStorage.getItem('inventory'));
        
        if (!oldInventoryData || oldInventoryData.length === 0) {
            oldDataContent.innerHTML = "<p>Aucune donnée d'inventaire local n'a été trouvée.</p>";
        } else {
            let html = '<ul>';
            oldInventoryData.forEach(item => {
                html += `<li><strong>${item.name}</strong> (Quantité: ${item.quantity}, Catégorie: ${item.category})</li>`;
            });
            html += '</ul>';
            oldDataContent.innerHTML = html;
        }
        viewOldDataModal.style.display = 'block';
    }

    function exportOldInventory() {
        const oldInventoryData = localStorage.getItem('inventory');
        if (!oldInventoryData) {
            alert("Aucune donnée d'inventaire local à exporter.");
            return;
        }
        
        const blob = new Blob([oldInventoryData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'inventaire_local_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Votre fichier d'inventaire local a été téléchargé !");
    }
    
    function exportServerInventory() {
        if (!localStorage.getItem('authToken')) {
            alert("Veuillez vous connecter pour exporter votre inventaire.");
            return;
        }

        if (!inventory || inventory.length === 0) {
            alert("Votre inventaire utilisateur est vide.");
            return;
        }

        // On crée une copie propre des données pour l'export
        const dataToExport = JSON.stringify(inventory, null, 2);
        
        const blob = new Blob([dataToExport], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `inventaire_utilisateur_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const itemsToImport = JSON.parse(e.target.result);
                if(!Array.isArray(itemsToImport)) {
                    throw new Error("Le fichier JSON doit contenir un tableau (une liste) d'articles.");
                }
                
                // On vérifie si l'utilisateur est connecté
                if (!localStorage.getItem('authToken')) {
                    alert("Veuillez vous connecter avant d'importer un inventaire.");
                    return;
                }

                // On appelle la nouvelle API
                const result = await apiCall('inventory/import', 'POST', itemsToImport);
                alert(`${result.message}\n- ${result.articles_ajoutes} article(s) ajouté(s)\n- ${result.articles_mis_a_jour} article(s) mis à jour`);
                
                // On rafraîchit la liste de l'inventaire pour voir les changements
                loadServerData(); 
            } catch (error) {
                alert("Erreur lors de l'importation : " + error.message);
                console.error(error);
            } finally {
                // Réinitialise l'input pour pouvoir réimporter le même fichier si besoin
                inventoryFileInput.value = '';
            }
        };
        reader.readAsText(file);
    }

    // --- FONCTIONS DES MODALES ET UTILITAIRES ---
    function openRecipeFormModal(recipeId = null) {
        recipeForm.reset();
        document.getElementById('recipe-json-input').value = '';
        if (recipeId !== null) {
            const recipe = recipes.find(r => r.id == recipeId);
            if (recipe) {
                document.getElementById('recipe-modal-title').textContent = "Éditer la recette";
                document.getElementById('recipe-id').value = recipe.id;
                document.getElementById('recipe-name').value = recipe.name;
                document.getElementById('recipe-ingredients').value = recipe.ingredients;
                document.getElementById('recipe-instructions').value = recipe.instructions;
                document.getElementById('recipe-comments').value = recipe.comments;
            }
        } else {
            document.getElementById('recipe-modal-title').textContent = "Ajouter une Recette";
            document.getElementById('recipe-id').value = '';
        }
        recipeFormModal.style.display = 'block';
    }

    function closeRecipeFormModal() { recipeFormModal.style.display = 'none'; }
    function closeRecipeViewModal() { recipeViewModal.style.display = 'none'; }

    function viewRecipe(recipeId) {
        const recipe = recipes.find(r => r.id == recipeId);
        if (!recipe) return;

        // Reset de l'état maximisé à l'ouverture
        const modalContent = document.querySelector('#recipe-view-modal .modal-content');
        const modalHeader = document.querySelector('#recipe-view-modal .modal-header');

        // On enlève l'état maximisé
        modalContent.classList.remove('maximized');
        // On enlève les styles injectés par le déplacement précédent (top, left, absolute...)
        // Cela remet la fenêtre au centre (grâce au CSS par défaut)
        modalContent.style = ''; 

        document.getElementById('recipe-view-title').textContent = recipe.name;
        document.getElementById('recipe-view-ingredients').textContent = recipe.ingredients || "N/A";
        document.getElementById('recipe-view-instructions').textContent = recipe.instructions || "N/A";
        document.getElementById('recipe-view-comments').textContent = recipe.comments || "N/A";
        
        const footer = document.getElementById('recipe-view-footer');
        footer.innerHTML = `
            <button class="btn btn-success" id="add-ingredients-btn">Ajouter ingrédients à la liste</button>
            <button class="btn btn-warning" id="edit-recipe-btn">Éditer</button>
            <button class="btn btn-danger" id="delete-recipe-btn">Supprimer</button>`;
        
        footer.querySelector('#add-ingredients-btn').addEventListener('click', () => addRecipeIngredientsToShoppingList(recipe.id));
        footer.querySelector('#edit-recipe-btn').addEventListener('click', () => { closeRecipeViewModal(); openRecipeFormModal(recipe.id); });
        footer.querySelector('#delete-recipe-btn').addEventListener('click', () => deleteRecipe(recipe.id));

        // --- Logique Popout et Maximize ---
        
        // 1. Gestion du Popout (Nouvelle fenêtre)
        // On clone le bouton pour retirer les anciens event listeners s'il y en a
        const popoutBtn = document.getElementById('btn-popout-recipe');
        const newPopoutBtn = popoutBtn.cloneNode(true);
        popoutBtn.parentNode.replaceChild(newPopoutBtn, popoutBtn);

        newPopoutBtn.addEventListener('click', () => {
            const win = window.open("", "_blank", "width=800,height=900");
            const content = `
                <html>
                <head>
                    <title>${recipe.name}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>body { padding: 40px; font-family: sans-serif; }</style>
                </head>
                <body>
                    <h1>${recipe.name}</h1>
                    <hr>
                    <h3>Ingrédients</h3>
                    <pre>${recipe.ingredients || ''}</pre>
                    <h3>Instructions</h3>
                    <pre style="white-space: pre-wrap;">${recipe.instructions || ''}</pre>
                    <h3>Notes</h3>
                    <p>${recipe.comments || ''}</p>
                    <div style="margin-top:30px">
                        <button onclick="window.print()" class="btn btn-primary">Imprimer</button>
                        <button onclick="window.close()" class="btn btn-secondary">Fermer</button>
                    </div>
                </body>
                </html>
            `;
            win.document.write(content);
            win.document.close();
            // Optionnel : fermer la modale actuelle
            // closeRecipeViewModal(); 
        });

        // 2. Gestion du Maximize (Agrandir)
        // On clone aussi pour nettoyer les events
        const maxBtn = document.getElementById('btn-maximize-recipe');
        const newMaxBtn = maxBtn.cloneNode(true);
        maxBtn.parentNode.replaceChild(newMaxBtn, maxBtn);

        newMaxBtn.addEventListener('click', () => {
            const isMaximized = modalContent.classList.toggle('maximized');
            
            // Si on maximise, on doit nettoyer les positions manuelles (top/left)
            // pour que le CSS width:100% / height:100% fonctionne bien
            if (isMaximized) {
                modalContent.style.top = '';
                modalContent.style.left = '';
                modalContent.style.position = '';
                modalContent.style.margin = '';
            } else {
                // Si on restaure, le CSS par défaut (margin: 10% auto) reprend le dessus
                // La fenêtre revient au centre.
            }

            // Gestion de l'icône
            const icon = newMaxBtn.querySelector('i');
            if (isMaximized) {
                icon.classList.remove('bi-arrows-fullscreen');
                icon.classList.add('bi-fullscreen-exit');
            } else {
                icon.classList.remove('bi-fullscreen-exit');
                icon.classList.add('bi-arrows-fullscreen');
            }
        });

        // --- Activation du déplacement ---
        // On appelle notre fonction utilitaire
        makeDraggable(modalContent, modalHeader);

        recipeViewModal.style.display = 'block';
    }

    async function addRecipeIngredientsToShoppingList(recipeId) {
        const recipe = recipes.find(r => r.id == recipeId);
        if (!recipe || !recipe.ingredients) {
            alert("Cette recette n'a pas d'ingrédients à ajouter.");
            return;
        }

        // Sépare les ingrédients par ligne et enlève les lignes vides
        const ingredients = recipe.ingredients.split('\n').filter(line => line.trim() !== '');
        if (ingredients.length === 0) {
            alert("Aucun ingrédient trouvé dans cette recette.");
            return;
        }

        if (!confirm(`Voulez-vous ajouter ${ingredients.length} ingrédient(s) à votre liste d'épicerie ?`)) {
            return;
        }

        const itemsToAddPromises = [];
        let itemsSkippedCount = 0;

        ingredients.forEach(ingredientName => {
            const cleanedName = ingredientName.split('(')[0].trim();

            // Vérifie si l'article est déjà dans la liste (insensible à la casse)
            const alreadyInList = shoppingList.some(shopItem =>
                shopItem.name.trim().toLowerCase() === cleanedName.toLowerCase()
            );

            if (!alreadyInList) {
                const newItem = {
                    name: cleanedName,
                    quantity: '1' // Quantité par défaut
                };
                itemsToAddPromises.push(apiCall('shopping-list', 'POST', newItem));
            } else {
                itemsSkippedCount++;
            }
        });

        if (itemsToAddPromises.length === 0) {
            alert("Tous les ingrédients de cette recette sont déjà dans votre liste d'épicerie.");
            return;
        }

        try {
            await Promise.all(itemsToAddPromises);
            alert(`${itemsToAddPromises.length} ingrédient(s) ont été ajouté(s) avec succès.`);
            if (itemsSkippedCount > 0) {
                //console.log(`${itemsSkippedCount} ingrédient(s) étaient déjà dans la liste et n'ont pas été ajoutés.`);
            }
            loadServerData(); // Recharge les données pour voir la liste à jour
        } catch (error) {
            console.error("Erreur lors de l'ajout des ingrédients:", error);
            alert("Une erreur est survenue lors de l'ajout des ingrédients.");
        } finally {
            closeRecipeViewModal(); // Ferme la modale après l'opération
        }
    }

    function toggleInclusion(e) {
        inventory[e.target.dataset.index].include = e.target.checked;
        updateToggleAllCheckboxState();
    }
    function toggleAll(e) {
        inventory.forEach(item => item.include = e.target.checked);
        renderInventory();
    }
    function updateToggleAllCheckboxState() {
        if (toggleAllCheckbox) {
            toggleAllCheckbox.checked = inventory.length > 0 && inventory.every(item => item.include);
        }
    }
    function parseQuantity(q) {
        const match = String(q).match(/^[xX]?(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    }
    function copyToClipboard(element, button) {
        element.select();
        document.execCommand('copy');
        const originalText = button.textContent;
        button.textContent = 'Copié!';
        setTimeout(() => { button.textContent = originalText; }, 2000);
    }

    function attachStaticListeners() {
        const addCategoryBtn = document.getElementById('add-category-btn');
        if (addCategoryBtn) {
            addCategoryBtn.replaceWith(addCategoryBtn.cloneNode(true));
            document.getElementById('add-category-btn').addEventListener('click', handleAddNewCategory);
        }

        const addItemForm = document.getElementById('addItemForm');
        if (addItemForm) {
            addItemForm.addEventListener('submit', addItem);
        }
    }
        
    // --- PARTIE 3 : INITIALISATION ET ATTACHEMENT DES ÉVÉNEMENTS (LA PARTIE CORRIGÉE) ---
    function attachShoppingListListeners() {
        document.querySelectorAll('.btn-delete-shopping').forEach(b => b.addEventListener('click', deleteShoppingItem));
        document.querySelectorAll('.btn-move').forEach(b => b.addEventListener('click', moveItemToInventory));
    }

    // Préréglage de la disposition idéale pour la page de l'assistant
    const ASSISTANT_LAYOUT_PRESET = [
        { 'gs-id': 'inventory-widget',       w: 8, h: 6, x: 0, y: 0 },
        { 'gs-id': 'shopping-list-widget',   w: 8, h: 5, x: 0, y: 6 },
        { 'gs-id': 'tools-widget',           w: 4, h: 7, x: 8, y: 0 },
        { 'gs-id': 'recipe-book-widget',     w: 4, h: 5, x: 8, y: 6 },
        { 'gs-id': 'generate-list-widget',   w: 6, h: 5, x: 0, y: 11 },
        { 'gs-id': 'recipe-generator-widget',w: 6, h: 5, x: 6, y: 11 },
    ];

    /**
     * Applique une disposition prédéfinie à la grille.
     * @param {Array} preset Le tableau d'objets définissant la disposition.
     */
    function applyLayoutPreset(preset) {
        if (!grid) return;

        // On désactive temporairement les événements pour éviter des sauvegardes multiples
        grid.batchUpdate();
        preset.forEach(itemPreset => {
            const element = document.querySelector(`.grid-stack-item[gs-id='${itemPreset['gs-id']}']`);
            if (element) {
                grid.update(element, itemPreset);
            }
        });
        // On réactive les événements et on déclenche le rendu
        grid.commit();
    }

    /**
     * Injecte les boutons de minimisation et gère la logique Gridstack
     */
    function setupWidgetMinimization() {
        const items = document.querySelectorAll('.grid-stack-item-content');
        
        items.forEach(content => {
            // Éviter les doublons si on réappelle la fonction
            if (content.querySelector('.widget-controls')) return;

            // Création du conteneur de bouton
            const controls = document.createElement('div');
            controls.className = 'widget-controls';
            
            const btn = document.createElement('button');
            btn.className = 'btn-minimize';
            btn.innerHTML = '<i class="bi bi-dash-lg"></i>'; // Icône tiret
            btn.title = "Minimiser / Restaurer";
            
            // Gestion du clic
            btn.addEventListener('click', function(e) {
                // Empêcher le drag and drop de se déclencher sur le clic
                e.stopPropagation(); 
                
                const widget = content.closest('.grid-stack-item');
                const gsNode = widget.gridstackNode; // Accès interne à Gridstack

                if (content.classList.contains('minimized')) {
                    // --- ACTION : RESTAURER ---
                    content.classList.remove('minimized');
                    btn.innerHTML = '<i class="bi bi-dash-lg"></i>';
                    
                    // Récupérer la hauteur sauvegardée ou utiliser une valeur par défaut
                    const originalH = parseInt(widget.dataset.savedHeight) || 4;
                    
                    // Mise à jour Gridstack
                    grid.update(widget, { h: originalH });
                    
                } else {
                    // --- ACTION : MINIMISER ---
                    // Sauvegarder la hauteur actuelle
                    widget.dataset.savedHeight = gsNode.h;
                    
                    content.classList.add('minimized');
                    btn.innerHTML = '<i class="bi bi-square"></i>'; // Icône carré pour agrandir
                    
                    // Mise à jour Gridstack vers hauteur 1
                    grid.update(widget, { h: 1 });
                }
            });

            controls.appendChild(btn);
            content.appendChild(controls); // Ajout en haut à droite (via CSS absolute)
        });
    }

    /**
     * Rend un élément modal déplaçable via son en-tête.
     * @param {HTMLElement} modalContent - L'élément qui bouge (.modal-content)
     * @param {HTMLElement} handle - L'élément qui sert de poignée (.modal-header)
     */
    function makeDraggable(modalContent, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        handle.addEventListener('mousedown', (e) => {
            // Ignorer si maximisé ou si on clique sur un bouton/croix
            if (modalContent.classList.contains('maximized') || 
                e.target.closest('button') || 
                e.target.closest('.close-btn')) {
                return;
            }

            e.preventDefault(); // Empêche la sélection de texte
            isDragging = true;
            handle.style.cursor = 'grabbing';
            
            // 1. Désactiver la transition CSS pour supprimer le LAG
            modalContent.classList.add('dragging');

            // 2. Figer la position actuelle pour passer en mode absolu
            const rect = modalContent.getBoundingClientRect();
            
            // Calcul du décalage exact entre la souris et le coin haut-gauche de la fenêtre
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;

            // On passe en position fixed/absolute par rapport à la vue
            modalContent.style.margin = '0';
            modalContent.style.position = 'fixed'; // 'fixed' est souvent plus stable que absolute pour les modales
            modalContent.style.left = rect.left + 'px';
            modalContent.style.top = rect.top + 'px';
            modalContent.style.width = rect.width + 'px'; // Fixe la largeur pour éviter le redimensionnement
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();

            // Positionnement simple et direct (souris - décalage initial)
            const x = e.clientX - startX;
            const y = e.clientY - startY;

            modalContent.style.left = `${x}px`;
            modalContent.style.top = `${y}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'move';
                
                // Réactiver la transition CSS
                modalContent.classList.remove('dragging');
                
                // --- CORRECTION DU "DROP QUI FERME LA FENÊTRE" ---
                // On ajoute un marqueur temporaire sur la fenêtre modale globale
                // pour dire "Je viens de bouger, ne me ferme pas".
                const modalContainer = modalContent.closest('.modal');
                if (modalContainer) {
                    modalContainer.dataset.justDropped = 'true';
                    setTimeout(() => {
                        modalContainer.dataset.justDropped = 'false';
                    }, 100);
                }
            }
        });
    }

    /**
     * Réorganisation Intelligente (Smart Arrange)
     */
    function smartAutoArrange() {
        if (!grid) return;
        
        // Bloque les mises à jour visuelles pour la performance
        grid.batchUpdate();
        
        // 1. On récupère les nœuds actuels
        const nodes = grid.engine.nodes;
        
        // 2. On les trie selon leur position visuelle actuelle (Y puis X)
        nodes.sort((a, b) => {
            return (a.y - b.y) || (a.x - b.x);
        });

        // 3. On demande à GridStack de recalculer la position (autoPosition: true)
        nodes.forEach(node => {
            grid.update(node.el, { x: undefined, y: undefined, autoPosition: true });
        });

        grid.commit();
    }

    function initializeApp() {
        console.log("Initialisation de l'application...");

        initializeGrid();
                
        // ÉTAPE 1 (CORRIGÉE) : On capture d'abord TOUS les éléments du DOM
        // On regroupe toutes les assignations ici pour être certain de ne rien manquer.
        inventoryDisplay = document.getElementById('inventory-display');
        shoppingListDisplay = document.getElementById('shopping-list-display');
        recipeListDisplay = document.getElementById('recipe-list-display');
        
        addItemForm = document.getElementById('addItemForm');
        addShoppingItemForm = document.getElementById('addShoppingItemForm');
        
        promptOutputSection = document.getElementById('prompt-output-section');
        promptOutputTextarea = document.getElementById('prompt-output-textarea');
        importShoppingListTextarea = document.getElementById('importShoppingListTextarea');
        
        recipeFormModal = document.getElementById('recipe-form-modal');
        recipeViewModal = document.getElementById('recipe-view-modal');
        recipeModalTitle = document.getElementById('recipe-modal-title');
        
        viewOldDataModal = document.getElementById('view-old-data-modal');
        oldDataContent = document.getElementById('old-data-content');
        
        toggleAllCheckbox = document.getElementById('toggleAll');
        generateShoppingListBtn = document.getElementById('generateShoppingListBtn');
        copyPromptBtn = document.getElementById('copy-prompt-btn');
        addLowStockItemsBtn = document.getElementById('addLowStockItemsBtn');
        importShoppingListBtn = document.getElementById('importShoppingListBtn');
        generateRecipeBtn = document.getElementById('generateRecipeBtn');
        showAddRecipeBtn = document.getElementById('show-add-recipe-modal-btn');
        closeRecipeFormBtn = document.getElementById('close-recipe-form-modal');
        closeRecipeViewBtn = document.getElementById('close-recipe-view-modal');
        recipeForm = document.getElementById('recipe-form');
        copyRecipePromptBtn = document.getElementById('copy-recipe-prompt-btn');
        importRecipeJsonBtn = document.getElementById('import-recipe-json-btn');
        viewOldInventoryBtn = document.getElementById('view-old-inventory-btn');
        exportInventoryBtn = document.getElementById('export-inventory-btn');
        importInventoryBtn = document.getElementById('import-inventory-btn');
        inventoryFileInput = document.getElementById('inventory-file-input');
        closeOldDataModalBtn = document.getElementById('close-old-data-modal');
        autoArrangeBtn = document.getElementById('auto-arrange-btn');
        reorganizeBtn = document.getElementById('reorganize-layout-btn');
        compactBtn = document.getElementById('compact-layout-btn');
        smartArrangeBtn = document.getElementById('smart-arrange-layout-btn');
        addCategoryBtn = document.getElementById('add-category-btn');

        setupWidgetMinimization(); 

        document.body.addEventListener('dragstart', function(e) {
            const item = e.target.closest('.inventory-item');
            if (item) {
                draggedItemId = item.dataset.itemId;
                console.log(`[DRAG-DEBUG] dragstart pour item ID: ${draggedItemId}`);
                // On ajoute la classe 'dragging' pour le retour visuel
                setTimeout(() => item.classList.add('dragging'), 0);
            }
        });

        document.body.addEventListener('dragover', function(e) {
            const section = e.target.closest('.inventory-section');
            if (section) {
                e.preventDefault(); // Nécessaire pour autoriser le 'drop'
                
                // Logique pour le retour visuel (survol)
                document.querySelectorAll('.inventory-item.drag-over, .inventory-section.drag-over').forEach(el => el.classList.remove('drag-over'));
                const targetItem = e.target.closest('.inventory-item');
                if (targetItem && targetItem.dataset.itemId !== draggedItemId) {
                    targetItem.classList.add('drag-over');
                } else {
                    section.classList.add('drag-over');
                }
            }
        });

        document.body.addEventListener('dragleave', function(e) {
            e.target.closest('.inventory-item')?.classList.remove('drag-over');
            e.target.closest('.inventory-section')?.classList.remove('drag-over');
        });

        document.body.addEventListener('drop', async function(e) {
            const dropSectionTarget = e.target.closest('.inventory-section');
            if (!draggedItemId || !dropSectionTarget) {
                return;
            }
            e.preventDefault();
            console.log(`[DRAG-DEBUG] drop détecté sur la section:`, dropSectionTarget.querySelector('.category-title').textContent.trim());

            const draggedElement = document.querySelector(`.inventory-item[data-item-id='${draggedItemId}']`);
            if (!draggedElement) return;

            const dropItemTarget = e.target.closest('.inventory-item');
            const targetList = dropSectionTarget.querySelector('ul');

            // Mettre à jour le DOM immédiatement
            if (dropItemTarget) {
                targetList.insertBefore(draggedElement, dropItemTarget);
            } else {
                targetList.appendChild(draggedElement);
            }

            // Préparer et envoyer les données à l'API
            const orderedItemIds = Array.from(targetList.querySelectorAll('.inventory-item')).map(item => parseInt(item.dataset.itemId, 10));
            const targetCategoryIdStr = dropSectionTarget.dataset.categoryId;
            const targetCategoryId = (targetCategoryIdStr === 'null_category' || !targetCategoryIdStr) ? null : parseInt(targetCategoryIdStr, 10);
            
            console.log(`[DRAG-DEBUG] Envoi à l'API:`, { category_id: targetCategoryId, ordered_ids: orderedItemIds });

            try {
                await apiCall('inventory/reorder', 'POST', {
                    category_id: targetCategoryId,
                    ordered_ids: orderedItemIds
                });
                console.log("[DRAG-DEBUG] API a répondu avec succès. Rechargement des données.");
                await loadServerData(); // Resynchroniser l'état
            } catch (error) {
                console.error("[DRAG-DEBUG] Erreur API:", error);
                alert("Une erreur est survenue. L'affichage va être rechargé.");
                window.location.reload();
            }
        });

        document.body.addEventListener('dragend', function(e) {
            // Nettoyer toutes les classes de style du drag-and-drop
            document.querySelectorAll('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
            draggedItemId = null;
            console.log("[DRAG-DEBUG] dragend");
        });

        // Cela capture le clic quel que soit l'état de GridStack
        document.body.addEventListener('click', function(e) {
            // On vérifie si l'élément cliqué (ou son parent) est le bouton d'ajout
            const btn = e.target.closest('#show-add-recipe-modal-btn');
            if (btn) {
                e.preventDefault(); // Empêche le comportement par défaut si nécessaire
                openRecipeFormModal();
            }
        });
        
        // --- GESTION DÉLÉGUÉE POUR LES OUTILS D'INVENTAIRE ---
        document.body.addEventListener('click', function(e) {
            // 1. Bouton "Voir l'inventaire local"
            if (e.target.closest('#view-old-inventory-btn')) {
                e.preventDefault();
                viewOldInventory();
            }
            
            // 2. Bouton "Exporter" (Local)
            if (e.target.closest('#export-inventory-btn')) {
                e.preventDefault();
                exportOldInventory();
            }

            // 3. Bouton "Exporter" (Serveur / Utilisateur)
            if (e.target.closest('#export-server-inventory-btn')) {
                e.preventDefault();
                exportServerInventory();
            }
            
            // 4. Bouton "Importer"
            if (e.target.closest('#import-inventory-btn')) {
                e.preventDefault();
                // Important : On cherche l'input file FRAIS dans le DOM actuel
                const currentFileInput = document.getElementById('inventory-file-input');
                if (currentFileInput) currentFileInput.click();
            }
        });

        // 4. Gestion de l'input file (événement 'change' délégué)
        document.body.addEventListener('change', function(e) {
            if (e.target.id === 'inventory-file-input') {
                handleFileImport(e);
            }
        });

        // ÉTAPE 3 : On attache tous les écouteurs d'événements
        if (addShoppingItemForm) addShoppingItemForm.addEventListener('submit', addShoppingItem);
        if (toggleAllCheckbox) toggleAllCheckbox.addEventListener('change', toggleAll);
        if (generateShoppingListBtn) generateShoppingListBtn.addEventListener('click', generateShoppingListPrompt);
        if (copyPromptBtn) copyPromptBtn.addEventListener('click', () => copyToClipboard(promptOutputTextarea, copyPromptBtn));
        if (addLowStockItemsBtn) addLowStockItemsBtn.addEventListener('click', addLowStockItemsToShoppingList);
        if (importShoppingListBtn) importShoppingListBtn.addEventListener('click', importShoppingListData);
        if (generateRecipeBtn) generateRecipeBtn.addEventListener('click', generateRecipePrompt);
        if (closeRecipeFormBtn) closeRecipeFormBtn.addEventListener('click', closeRecipeFormModal);
        if (closeRecipeViewBtn) closeRecipeViewBtn.addEventListener('click', closeRecipeViewModal);
        if (recipeForm) recipeForm.addEventListener('submit', handleRecipeFormSubmit);
        if (copyRecipePromptBtn) copyRecipePromptBtn.addEventListener('click', () => copyToClipboard(document.getElementById('ai-recipe-prompt'), copyRecipePromptBtn));
        if (importRecipeJsonBtn) importRecipeJsonBtn.addEventListener('click', importRecipeDataFromJson);

        attachStaticListeners();
        
        if (reorganizeBtn) {
            reorganizeBtn.addEventListener('click', (e) => { e.preventDefault(); applyLayoutPreset(ASSISTANT_LAYOUT_PRESET); });
        }
        if (compactBtn) {
            compactBtn.addEventListener('click', (e) => { e.preventDefault(); if (grid) grid.compact(); });
        }
        if (smartArrangeBtn) {
            smartArrangeBtn.addEventListener('click', (e) => { e.preventDefault(); smartAutoArrange(); });
        }
        if (closeOldDataModalBtn) closeOldDataModalBtn.addEventListener('click', () => viewOldDataModal.style.display = 'none');

        window.addEventListener('click', e => {
            // ... vos gestionnaires existants ...
            if (e.target == recipeFormModal) closeRecipeFormModal();
            
            if (e.target == recipeViewModal) {
                // Si on vient de lâcher la fenêtre (drag & drop), on ne ferme pas
                if (recipeViewModal.dataset.justDropped === 'true') {
                    return;
                }
                closeRecipeViewModal();
            }
            
            if (e.target == viewOldDataModal) viewOldDataModal.style.display = 'none';
        });

        // Attachement des écouteurs pour le Drag and Drop
        if (shoppingListDisplay) {
            shoppingListDisplay.addEventListener('dragstart', (e) => { if (e.target.classList.contains('shopping-list-item')) { draggedShoppingItemIndex = parseInt(e.target.dataset.index, 10); setTimeout(() => { e.target.classList.add('dragging'); }, 0); } });
            shoppingListDisplay.addEventListener('dragover', (e) => { e.preventDefault(); const target = e.target.closest('.shopping-list-item'); if (target && parseInt(target.dataset.index, 10) !== draggedShoppingItemIndex) { document.querySelectorAll('.shopping-list-item.drag-over').forEach(el => el.classList.remove('drag-over')); target.classList.add('drag-over'); } });
            shoppingListDisplay.addEventListener('dragleave', (e) => { const target = e.target.closest('.shopping-list-item'); if (target) { target.classList.remove('drag-over'); } });
            shoppingListDisplay.addEventListener('drop', (e) => { e.preventDefault(); const dropTarget = e.target.closest('.shopping-list-item'); if (dropTarget && draggedShoppingItemIndex !== null) { const dropIndex = parseInt(dropTarget.dataset.index, 10); const itemToMove = shoppingList.splice(draggedShoppingItemIndex, 1)[0]; shoppingList.splice(dropIndex, 0, itemToMove); saveShoppingList(); renderShoppingList(); } });
            shoppingListDisplay.addEventListener('dragend', (e) => { document.querySelectorAll('.shopping-list-item.dragging, .shopping-list-item.drag-over').forEach(el => el.classList.remove('dragging', 'drag-over')); draggedShoppingItemIndex = null; });
        }
    }

    initializeApp();
    // Lancement initial
    loadServerData();
});