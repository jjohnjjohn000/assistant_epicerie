/**
 * Logique pour la page Optimiseur de Rabais
 * Gère les cartes, les calculs de prix et les circulaires.
 */

document.addEventListener('DOMContentLoaded', function() {
    // --- PARTIE 1 : DÉCLARATION DES VARIABLES ---
    // Les variables pour les éléments du DOM seront assignées dans initializePage()
    let findStoresBtn, sortStoresBtn, optimizeListBtn, printListBtn,
        generateRouteBtn, addStoreUrlForm,
        manualStoreUrlInput, importFlyerForm, flyerJsonInput, flyerModal, modalTitle,
        modalBody, closeBtn, manageFlyersBtn, flyerManagerModal, modalManagerBody,
        closeBtnManager, editStoreModal, closeBtnEdit, editStoreForm, copyAiPromptBtn,
        aiPromptTextarea, findPricesBtn, priceFinderContainer, priceFinderPromptOutput,
        priceFinderPromptTextarea, copyPriceFinderPromptBtn, importPricesJsonTextarea,
        importPricesBtn, priceModal, closePriceModalBtn, submitPriceForm, modalProductName,
        hiddenProductNameInput, storeSelect, priceInput, addProductModal,
        closeAddProductModalBtn, addProductForm, newProductNameDisplay,
        hiddenNewProductNameInput, addDealBtn, submitDealModal, closeDealModalBtn,
        submitDealForm, reportPriceModal, closeReportModalBtn, reportPriceForm,
        reportProductName, hiddenReportPriceId, optimizationDisplay, autoArrangeBtn, reorganizeBtn, compactBtn, smartArrangeBtn;

    // Variables d'état
    let optimizedItems = [];
    let allStores = [];
    let nearbyStores = [];
    let manualStores = [];
    let flyerData = {};
    let activeDeals = [];
    let grid;
    let draggedItemIndex = null;
    const ACCORDION_STATE_KEY = 'optimiseurAccordionStates';

    // --- PARTIE 2 : DÉFINITION DES FONCTIONS ---

    function initializeGrid() {
        grid = GridStack.init({
            float: true,
            cellHeight: '70px',
            minRow: 1,
        });

        grid.on('change', async function (event, items) {
            if (localStorage.getItem('authToken')) {
                const serializedData = grid.save();
                try {
                    await apiCall('/api/user/layout?page=optimiseur', 'POST', serializedData);
                } catch (error) {
                    console.error("Erreur de sauvegarde de la disposition:", error);
                }
            }
        });
    }
    // Préréglage de la disposition idéale pour la page de l'optimiseur
    const OPTIMISEUR_LAYOUT_PRESET = [
        { 'gs-id': 'flyer-deals-widget',     w: 12, h: 6, x: 0, y: 0 },
        { 'gs-id': 'store-selection-widget', w: 6,  h: 8, x: 0, y: 6 },
        { 'gs-id': 'optimization-widget',    w: 6,  h: 5, x: 6, y: 6 },
        { 'gs-id': 'route-widget',           w: 6,  h: 3, x: 6, y: 11 },
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

    // --- FIN DE LA NOUVELLE LOGIQUE ---

    /**
     * Sauvegarde l'état (ouvert/fermé) de chaque accordéon de magasin.
     */
    function saveAccordionStates() {
        const states = {};
        document.querySelectorAll('#rabais-actifs-display .store-rabais-group').forEach(details => {
            const summary = details.querySelector('.store-rabais-summary');
            if (summary && summary.firstChild) {
                // Extrait le nom du magasin, qui est le premier nœud de texte dans le <summary>
                const storeName = summary.firstChild.textContent.trim();
                if (storeName) {
                    states[storeName] = details.open;
                }
            }
        });
        localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(states));
    }

    /**
     * Applique l'état sauvegardé aux accordéons lors du chargement.
     */
    function applyAccordionStates() {
        const savedStates = JSON.parse(localStorage.getItem(ACCORDION_STATE_KEY)) || {};
        document.querySelectorAll('#rabais-actifs-display .store-rabais-group').forEach(details => {
            const summary = details.querySelector('.store-rabais-summary');
            if (summary && summary.firstChild) {
                const storeName = summary.firstChild.textContent.trim();
                // Si un état est sauvegardé pour ce magasin, on l'applique.
                // Par défaut, l'accordéon restera fermé si aucun état n'est trouvé.
                if (savedStates.hasOwnProperty(storeName)) {
                    details.open = savedStates[storeName];
                } else {
                    details.open = false; // Fermé par défaut
                }
            }
        });
    }

    function saveFlyerData() { localStorage.setItem('flyerData', JSON.stringify(flyerData)); }
    function loadFlyerData() { flyerData = JSON.parse(localStorage.getItem('flyerData')) || {}; }
    function saveManualStores() { localStorage.setItem('manualStoresList', JSON.stringify(manualStores)); }
    function loadManualStores() { manualStores = JSON.parse(localStorage.getItem('manualStoresList')) || []; }
    
    function openFlyerManagerModal() {
        renderFlyerManagerList();
        flyerManagerModal.style.display = 'block';
    }

    function closeFlyerManagerModal() {
        flyerManagerModal.style.display = 'none';
    }

    function renderFlyerManagerList() {
        modalManagerBody.innerHTML = '';
        const savedFlyers = Object.keys(flyerData);

        if (savedFlyers.length === 0) {
            modalManagerBody.innerHTML = '<p class="placeholder-text">Aucune circulaire sauvegardée.</p>';
            return;
        }

        savedFlyers.sort().forEach(storeName => {
            const itemElement = document.createElement('div');
            itemElement.className = 'managed-flyer-item';
            itemElement.innerHTML = `
                <span class="flyer-item-name">${storeName}</span>
                <button class="btn btn-primary btn-small btn-delete-flyer" data-store-name="${storeName}">
                    <i class="bi bi-magic"></i> Supprimer
                </button>
            `;
            modalManagerBody.appendChild(itemElement);
        });
        
        document.querySelectorAll('.btn-delete-flyer').forEach(button => {
            button.addEventListener('click', deleteFlyerAndStore);
        });
    }
    
    function deleteFlyerAndStore(event) {
        const storeNameToDelete = event.target.dataset.storeName;
        
        if (confirm(`Êtes-vous sûr de vouloir supprimer la circulaire et le commerce associé "${storeNameToDelete}" ? Cette action est irréversible.`)) {
            if (flyerData[storeNameToDelete]) {
                delete flyerData[storeNameToDelete];
                saveFlyerData();
            }
            manualStores = manualStores.filter(store => store.name !== storeNameToDelete);
            saveManualStores();
            renderAllStores();
            renderFlyerManagerList();
        }
    }

    function openStoreEditModal(event) {
        const storeNameToEdit = event.target.dataset.storeName;
        const storeData = manualStores.find(s => s.name === storeNameToEdit);
        if (storeData) {
            document.getElementById('originalStoreName').value = storeData.name;
            document.getElementById('editStoreName').value = storeData.name;
            document.getElementById('editStoreAddress').value = storeData.address || '';
            document.getElementById('editStoreWebsite').value = (storeData.website && storeData.website !== '#') ? storeData.website : '';
            editStoreModal.style.display = 'block';
        }
    }

    function closeStoreEditModal() {
        editStoreModal.style.display = 'none';
    }

    function handleStoreEditFormSubmit(event) {
        event.preventDefault();
        const originalName = document.getElementById('originalStoreName').value;
        const newName = document.getElementById('editStoreName').value.trim();
        const newAddress = document.getElementById('editStoreAddress').value.trim();
        const newWebsite = document.getElementById('editStoreWebsite').value.trim();

        if (!newName) {
            alert("Le nom du commerce ne peut pas être vide.");
            return;
        }

        const storeIndex = manualStores.findIndex(s => s.name === originalName);
        if (storeIndex === -1) {
            alert("Erreur: impossible de trouver le commerce original.");
            return;
        }

        if (newName.toLowerCase() !== originalName.toLowerCase() && manualStores.some(s => s.name.toLowerCase() === newName.toLowerCase())) {
            alert("Un commerce avec ce nom existe déjà.");
            return;
        }

        manualStores[storeIndex].name = newName;
        manualStores[storeIndex].address = newAddress;
        manualStores[storeIndex].website = newWebsite || '#';
        saveManualStores();

        if (newName !== originalName && flyerData.hasOwnProperty(originalName)) {
            flyerData[newName] = flyerData[originalName];
            delete flyerData[originalName];
            saveFlyerData();
        }

        closeStoreEditModal();
        renderAllStores();
    }

    function copyAiPrompt() {
        aiPromptTextarea.select();
        aiPromptTextarea.setSelectionRange(0, 99999);
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                const originalText = copyAiPromptBtn.textContent;
                copyAiPromptBtn.textContent = 'Copié !';
                setTimeout(() => { copyAiPromptBtn.textContent = originalText; }, 2000);
            } else {
                throw new Error('Copy command failed');
            }
        } catch (err) {
            alert('La copie automatique a échoué. Veuillez copier le texte manuellement (Ctrl+C).');
        }
    }

    function extractNameFromUrl(urlString) {
        try {
            if (!urlString.startsWith('http')) { urlString = 'https://' + urlString; }
            const url = new URL(urlString);
            let hostname = url.hostname.replace(/^www\./i, '');
            const parts = hostname.split('.');
            const name = parts[0];
            return name.charAt(0).toUpperCase() + name.slice(1);
        } catch (e) {
            return null;
        }
    }

    function addStoreFromUrl(event) {
        event.preventDefault();
        const storeUrl = manualStoreUrlInput.value.trim();
        if (!storeUrl) return;

        const storeName = extractNameFromUrl(storeUrl);
        if (!storeName) { alert("Veuillez entrer une adresse web valide."); return; }

        const isAlreadyInManual = manualStores.some(s => s.website === storeUrl || s.name.toLowerCase() === storeName.toLowerCase());
        const isAlreadyInNearby = nearbyStores.some(store => store.name.toLowerCase() === storeName.toLowerCase());

        if (!isAlreadyInManual && !isAlreadyInNearby) {
            manualStores.push({ name: storeName, website: storeUrl, address: '' });
            saveManualStores(); renderAllStores(); manualStoreUrlInput.value = '';
        } else {
            alert('Ce commerce est déjà dans la liste.');
        }
    }

    function deleteManualStore(event) {
        event.preventDefault(); event.stopPropagation();
        const nameToDelete = event.target.dataset.storeName;
        manualStores = manualStores.filter(store => store.name !== nameToDelete);
        
        if (flyerData[nameToDelete]) {
            delete flyerData[nameToDelete];
            saveFlyerData();
        }
        saveManualStores(); renderAllStores();
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function findNearbyStores() {
        findStoresBtn.disabled = true;
        sortStoresBtn.style.display = 'none';
        const storesListContainer = document.getElementById('stores-list-display');
        if (!storesListContainer) { console.error("Could not find stores-list-display"); return; }
        storesListContainer.innerHTML = '<p>Recherche des commerces en cours...</p>';

        if (!navigator.geolocation) {
            storesListContainer.innerHTML = '<p>La géolocalisation n\'est pas supportée par votre navigateur.</p>';
            findStoresBtn.disabled = false;
            return;
        }

        const selectedTypes = Array.from(document.querySelectorAll('.store-type-filter:checked')).map(cb => cb.value);
        if (selectedTypes.length === 0) {
            storesListContainer.innerHTML = '<p>Veuillez sélectionner au moins un type de commerce.</p>';
            findStoresBtn.disabled = false;
            return;
        }

        navigator.geolocation.getCurrentPosition(async position => {
            const { latitude, longitude } = position.coords;
            const radius = 2000; // Rayon de recherche de 2km

            // --- DÉBUT DE LA MODIFICATION : Requête Overpass simplifiée et plus robuste ---
            let queryParts = [];
            
            // Regroupe les types 'shop' pour une requête plus efficace
            const shopTypes = selectedTypes.filter(type => ['supermarket', 'grocery', 'convenience'].includes(type));
            if (shopTypes.length > 0) {
                // Utilise l'opérateur '~' pour une regex qui cherche l'un des types
                const shopQuery = shopTypes.join('|');
                queryParts.push(`nwr["shop"~"${shopQuery}"](around:${radius},${latitude},${longitude});`);
            }

            // Gère la pharmacie séparément car elle utilise la clé 'amenity'
            if (selectedTypes.includes('pharmacy')) {
                queryParts.push(`nwr["amenity"="pharmacy"](around:${radius},${latitude},${longitude});`);
            }

            // 'nwr' est un raccourci pour 'node, way, relation', ce qui simplifie la requête.
            const query = `[out:json][timeout:25]; (${queryParts.join('')}); out center;`;
            // --- FIN DE LA MODIFICATION ---

            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    // Donne un message d'erreur plus spécifique en cas d'échec de l'API
                    throw new Error(`Le service de cartographie a retourné une erreur : ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                console.log("Réponse de l'API Overpass :", data);
                processAndDisplayStores(data.elements, latitude, longitude);
            } catch (error) {
                console.error("Erreur Overpass:", error);
                storesListContainer.innerHTML = `<p>Impossible de récupérer les données des commerces. Le service externe est peut-être temporairement indisponible. <br>Erreur : ${error.message}</p>`;
            } finally {
                findStoresBtn.disabled = false;
            }
        }, () => {
            storesListContainer.innerHTML = '<p>La géolocalisation a été refusée. Veuillez autoriser l\'accès à votre position pour utiliser cette fonctionnalité.</p>';
            findStoresBtn.disabled = false;
        });
    }
    
    function processAndDisplayStores(places, userLat, userLon) {
        let foundStores = []; // Crée une liste temporaire pour les résultats
        
        // Gère le cas où la recherche ne retourne aucun résultat
        if (!places || places.length === 0) {
            nearbyStores = []; // Vide la liste des commerces à proximité
            renderAllStores(); // Affiche la liste (qui contiendra les commerces manuels)
            
            const storesListContainer = document.getElementById('stores-list-display');
            if (!storesListContainer) return;

            // Ajoute un message d'information clair pour l'utilisateur
            const message = document.createElement('p');
            message.style.color = '#e67e22'; // Orange pour un avertissement
            message.style.marginBottom = '15px';
            message.textContent = 'Aucun commerce correspondant aux critères n\'a été trouvé à proximité.';
            storesListContainer.prepend(message);
            return;
        }

        const uniquePlaces = new Map();
        places.forEach(place => {
            // Utilise toLowerCase() pour éviter les doublons dus à la casse (ex: "Iga" et "IGA")
            if (place.tags && place.tags.name && !uniquePlaces.has(place.tags.name.toLowerCase())) {
                uniquePlaces.set(place.tags.name.toLowerCase(), place);
            }
        });

        uniquePlaces.forEach(place => {
            const storeLat = place.type === 'node' ? place.lat : place.center.lat;
            const storeLon = place.type === 'node' ? place.lon : place.center.lon;
            const distance = calculateDistance(userLat, userLon, storeLat, storeLon);
            const website = place.tags.website || place.tags['contact:website'];
            const addressParts = [
                place.tags['addr:housenumber'],
                place.tags['addr:street'],
                place.tags['addr:city'],
                place.tags['addr:postcode']
            ].filter(Boolean); // Filtre les parties d'adresse vides
            const address = addressParts.join(', ') || 'Adresse non disponible';
            
            foundStores.push({
                id: place.id,
                name: place.tags.name,
                distance: distance,
                website: website,
                address: address,
                lat: storeLat,
                lon: storeLon
            });
        });

        // Remplace l'ancienne liste des commerces à proximité par la nouvelle
        nearbyStores = foundStores;
        
        renderAllStores(); // Met à jour l'affichage global
        sortStoresBtn.style.display = nearbyStores.length > 0 ? 'inline-block' : 'none';
    }

    function renderAllStores() {
        const storesListContainer = document.getElementById('stores-list-display');
        if (!storesListContainer) { console.error("Element #stores-list-display not found!"); return; }
        storesListContainer.innerHTML = '';

        // --- Logique améliorée pour fusionner et dédoublonner les listes ---
        const allStoresMap = new Map();
        
        // Les commerces manuels sont prioritaires
        manualStores.forEach(store => allStoresMap.set(store.name.toLowerCase(), store));
        
        // Ajoute les commerces à proximité seulement s'ils ne sont pas déjà dans la liste manuelle
        nearbyStores.forEach(store => {
            if (!allStoresMap.has(store.name.toLowerCase())) {
                allStoresMap.set(store.name.toLowerCase(), store);
            }
        });

        const allStores = Array.from(allStoresMap.values());

        // Trie la liste : d'abord par distance, puis alphabétiquement pour les commerces manuels
        allStores.sort((a, b) => {
            const aHasDist = a.distance !== undefined;
            const bHasDist = b.distance !== undefined;

            if (aHasDist && !bHasDist) return -1;
            if (!aHasDist && bHasDist) return 1;
            if (aHasDist && bHasDist) return a.distance - b.distance;
            return a.name.localeCompare(b.name);
        });
        // --- Fin de la logique améliorée ---

        if (allStores.length === 0) {
            storesListContainer.innerHTML = '<p class="placeholder-text">La liste des commerces apparaîtra ici. Utilisez la recherche ou ajoutez des commerces manuellement.</p>';
            return;
        }

        allStores.forEach(store => {
            const storeElement = document.createElement('div');
            storeElement.className = 'store-item';
            const sanitizedId = store.name.replace(/[^a-zA-Z0-9]/g, '');
            let isManual = manualStores.some(ms => ms.name.toLowerCase() === store.name.toLowerCase());
            
            let storeDetailsHtml;
            if (store.distance !== undefined) { // C'est un commerce trouvé à proximité
                storeDetailsHtml = `<div class="store-address">${store.address}</div><div class="store-details"><span>Distance: ~${store.distance.toFixed(1)} km</span> | <a href="https://www.openstreetmap.org/?mlat=${store.lat}&mlon=${store.lon}#map=18/${store.lat}/${store.lon}" target="_blank">Voir sur la carte</a></div>`;
            } else { // C'est un commerce manuel
                let addressHtml = store.address && store.address !== 'Adresse non fournie' ? `<div class="store-address">${store.address}</div>` : '';
                let websiteHtml = store.website && store.website !== '#' ? `<a href="${store.website}" target="_blank">Visiter le site web</a>` : `<span>(Ajouté manuellement)</span>`;
                storeDetailsHtml = `${addressHtml}<div class="store-details">${websiteHtml}</div>`;
            }
            
            const storeNameTrimmed = store.name.trim();
            const flyerDataKeys = Object.keys(flyerData);
            const matchingKey = flyerDataKeys.find(key => key.trim().toLowerCase() === storeNameTrimmed.toLowerCase());
            const hasFlyer = !!matchingKey;
            
            let flyerButtonHtml = hasFlyer ? `<button class="btn btn-primary btn-view-flyer" data-store-name="${matchingKey}">
                <i class="bi bi-magic"></i> Voir la circulaire
            </button>` : '';
            const editButtonHtml = isManual ? `<button class="btn btn-primary btn-edit-manual btn-small" data-store-name="${store.name}" style="background-color: #f39c12;">
                <i class="bi bi-magic"></i> Éditer
            </button>` : '';
            const deleteButtonHtml = isManual ? `<button class="btn btn-primary btn-delete-manual btn-small" data-store-name="${store.name}" style="background-color: #c0392b;">
                <i class="bi bi-magic"></i> X
            </button>` : '';

            storeElement.innerHTML = `<input type="checkbox" class="store-checkbox" value="${store.name}" id="store-${sanitizedId}" checked><label for="store-${sanitizedId}" style="display: flex; justify-content: space-between; align-items: center; width: 100%;"><div><div class="store-name">${store.name}</div>${storeDetailsHtml}</div><div class="store-actions">${editButtonHtml}${deleteButtonHtml}${flyerButtonHtml}</div></label>`;
            storesListContainer.appendChild(storeElement);
        });

        document.querySelectorAll('.btn-edit-manual').forEach(button => button.addEventListener('click', openStoreEditModal));
        document.querySelectorAll('.btn-delete-manual').forEach(button => button.addEventListener('click', deleteManualStore));
        document.querySelectorAll('.btn-view-flyer').forEach(button => button.addEventListener('click', openFlyerModal));
    }
    
    function sortStoresByDistance() {
        nearbyStores.sort((a, b) => a.distance - b.distance);
        renderAllStores();
    }
    function normalizeString(str) {
        return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function isFuzzyMatch(shoppingItemName, flyerItemName) {
        const normalizedShoppingName = normalizeString(shoppingItemName);
        const normalizedFlyerName = normalizeString(flyerItemName);
        
        const searchWords = normalizedShoppingName.split(' ').filter(word => word.length > 1);
        return searchWords.every(word => normalizedFlyerName.includes(word));
    }

    // Nécessaire pour les requêtes POST sécurisées avec Django
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // MODIFIER la fonction loadStoresIntoModal pour qu'elle s'occupe de TOUTES les listes déroulantes
    async function loadStoresIntoModal() {
        try {
            //const response = await fetch('/api/commerces/');
            const stores = await apiCall('/api/commerces/'); // NOUVEAU CODE

            //if (!response.ok) throw new Error('Impossible de charger les commerces.');                
            //const stores = await response.json();

            allStores = stores; // Sauvegarde pour un accès futur
            
            // --- DEBUT DE LA MODIFICATION ---
            const priceModalStoreSelect = document.getElementById('modal-store-select');
            const dealModalStoreSelect = document.getElementById('deal-store-select');

            // On réinitialise les deux listes
            priceModalStoreSelect.innerHTML = '<option value="">-- Choisissez un commerce --</option>'; 
            dealModalStoreSelect.innerHTML = '<option value="">-- Choisissez un commerce --</option>';

            const sortedStores = [...allStores].sort((a, b) => a.nom.localeCompare(b.nom));

            sortedStores.forEach(store => {
                const option = document.createElement('option');
                option.value = store.id;
                option.textContent = store.nom;
                // On ajoute l'option clonée aux deux listes
                priceModalStoreSelect.appendChild(option.cloneNode(true));
                dealModalStoreSelect.appendChild(option.cloneNode(true));
            });
            // --- FIN DE LA MODIFICATION ---

        } catch (error) {
            console.error("Erreur de chargement des commerces:", error);
            // Gérer l'erreur dans les deux listes
            document.getElementById('modal-store-select').innerHTML = '<option value="">Erreur</option>';
            document.getElementById('deal-store-select').innerHTML = '<option value="">Erreur</option>';
        }
    }

    // --- NOUVELLE LOGIQUE D'OUVERTURE DE LA MODALE (AVEC DÉLÉGATION D'ÉVÉNEMENT) ---
    function openPriceModal(event) {
        // On vérifie si l'élément cliqué est bien notre bouton
        if (event.target.classList.contains('btn-submit-price')) {
            const productName = event.target.dataset.itemName;
            
            // On remplit les champs de la modale
            modalProductName.textContent = productName;
            hiddenProductNameInput.value = productName;
            
            // On affiche la modale
            priceModal.style.display = 'block';
        }
    }


    // --- NOUVELLE LOGIQUE DE FERMETURE DE LA MODALE ---
    function closePriceModal() {
        priceModal.style.display = 'none';
        if (submitPriceForm) {
            submitPriceForm.reset(); // Vide le formulaire
        }
    }

    
    // --- NOUVELLE LOGIQUE DE SOUMISSION DU PRIX ---
    async function handlePriceSubmit(event) {
        event.preventDefault();
        
        const productName = hiddenProductNameInput.value;
        const commerceId = storeSelect.value;
        const price = priceInput.value;
        const token = localStorage.getItem('authToken');

        if (!token) {
            alert("Veuillez vous connecter pour soumettre un prix.");
            return;
        }

        try {
            const searchResponse = await apiCall(`/api/products/search/?q=${encodeURIComponent(productName)}`);
            const products = await searchResponse.json();
            
            let productId = null;
            if (products.length > 0) {
                // On prend le premier résultat qui correspond exactement (insensible à la casse)
                const exactMatch = products.find(p => p.nom.toLowerCase() === productName.toLowerCase());
                productId = exactMatch ? exactMatch.id : products[0].id;
            }

            // --- DEBUT DE LA LOGIQUE MODIFIÉE ---
            if (productId) {
                // Si le produit existe, on soumet le prix comme avant
                await submitPrice(productId, commerceId, price, token);
                alert('Merci ! Votre prix a été soumis avec succès.');
                closePriceModal();
            } else {
                // Si le produit n'existe PAS, on ouvre la modale pour l'ajouter
                newProductNameDisplay.textContent = productName;
                hiddenNewProductNameInput.value = productName;
                addProductModal.style.display = 'block';
            }
            // --- FIN DE LA LOGIQUE MODIFIÉE ---

        } catch (error) {
            console.error("Erreur lors de la soumission :", error);
            alert(error.message);
        }
    }


    // Fonction séparée pour la soumission de prix, pour la réutiliser
    async function submitPrice(productId, commerceId, price, token) {
        const submissionResponse = await apiCall('/api/prices/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
                'Authorization': `Token ${token}`
            },
            body: JSON.stringify({
                produit_id: productId,
                commerce_id: parseInt(commerceId),
                prix: price
            })
        });
        if (!submissionResponse.ok) {
            const errorData = await submissionResponse.json();
            throw new Error(errorData.detail || 'Erreur lors de la soumission du prix.');
        }
    }
    
    // --- DEBUT DES NOUVELLES FONCTIONS ---

    // Gère la soumission du formulaire d'ajout de produit
    async function handleAddProductSubmit(event) {
        event.preventDefault();
        const token = localStorage.getItem('authToken');
        const productName = hiddenNewProductNameInput.value;
        const brand = document.getElementById('new-product-brand').value;

        try {
            // Étape 1 : Créer le nouveau produit via l'API
            const createResponse = await apiCall('/api/products/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify({ nom: productName, marque: brand })
            });

            if (!createResponse.ok) {
                const errorData = await createResponse.json();
                throw new Error(errorData.error || 'Erreur lors de la création du produit.');
            }
            
            const newProduct = await createResponse.json();
            const newProductId = newProduct.id;

            // Étape 2 : Soumettre le prix avec le nouvel ID de produit
            const commerceId = storeSelect.value;
            const price = priceInput.value;
            await submitPrice(newProductId, commerceId, price, token);
            
            alert('Produit ajouté et prix soumis avec succès !');
            addProductModal.style.display = 'none';
            closePriceModal();

        } catch (error) {
            alert(error.message);
        }
    }

    
    // Gère la soumission du formulaire de rabais simple
    async function handleDealSubmit(event) {
        event.preventDefault();
        const token = localStorage.getItem('authToken');
        if (!token) {
            alert("Veuillez vous connecter pour soumettre un rabais.");
            return;
        }

        const dealData = {
            product_name: document.getElementById('deal-product-name').value,
            brand: document.getElementById('deal-product-brand').value,
            commerce_id: document.getElementById('deal-store-select').value,
            price_details: document.getElementById('deal-price-details').value,
            single_price: document.getElementById('deal-single-price').value,
            date_debut: document.getElementById('deal-date-debut').value,
            date_fin: document.getElementById('deal-date-fin').value,
        };

        try {
            const response = await apiCall('/api/submit-deal/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify(dealData)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.');

            alert(result.message);
            submitDealModal.style.display = 'none';
            submitDealForm.reset();
            // Rafraîchir la liste des rabais pour voir le nouveau
            chargerRabaisActifs();

        } catch (error) {
            alert(error.message);
        }
    }

    
    // --- FONCTION DE RENDU MODIFIÉE ---
    function renderOptimizedList() {
        const optimizationDisplayContainer = document.getElementById('optimization-display');
        if (!optimizationDisplayContainer) { console.error("Element #optimization-display not found!"); return; }
        optimizationDisplayContainer.innerHTML = '';

        if (optimizedItems.length === 0) {
            optimizationDisplayContainer.innerHTML = '<p class="placeholder-text">Votre liste d\'épicerie est vide ou n\'a pas encore été optimisée.</p>';
            findPricesBtn.style.display = 'none';
            return;
        }

        // On récupère le nom de l'utilisateur actuellement connecté
        const currentUser = localStorage.getItem('username');
        let total = 0;
        let hasItemsWithoutPrice = false;

        optimizedItems.forEach((item, itemIndex) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'optimized-item';
            itemElement.setAttribute('draggable', true);
            itemElement.setAttribute('data-index', itemIndex);

            const currentPrice = parseFloat(item.selectedPrice);
            total += isNaN(currentPrice) ? 0 : currentPrice;

            if (!item.selectedPrice || currentPrice === 0) {
                hasItemsWithoutPrice = true;
            }

            let dealsHtml;
            if (item.deals && item.deals.length > 0) {
                // Trier les offres: les rabais en premier, puis les prix communautaires
                item.deals.sort((a, b) => {
                    if (a.type === 'rabais' && b.type !== 'rabais') return -1;
                    if (a.type !== 'rabais' && b.type === 'rabais') return 1;
                    return 0;
                });

                const optionsHtml = item.deals.map((deal, dealIndex) => {
                    const isSelected = item.selectedDeal && item.selectedDeal.name === deal.name && item.selectedDeal.store === deal.store;

                    let actionButtonsHtml = '';
                    // On affiche les boutons Confirmer/Signaler uniquement pour les prix communautaires
                    if (deal.type === 'communautaire' && deal.price_id) {
                        actionButtonsHtml = `
                            <button class="btn btn-primary btn-small btn-confirm-price" data-price-id="${deal.price_id}" style="background-color: #27ae60; margin-left: 10px;">
                                <i class="bi bi-magic"></i> Confirmer
                            </button>
                            <button class="btn btn-primary btn-small btn-report-price" data-price-id="${deal.price_id}" data-product-name="${deal.name}" style="background-color: #e67e22; margin-left: 5px;">
                                <i class="bi bi-magic"></i> Signaler
                            </button>
                        `;
                    }

                        let confirmButtonHtml = '';
                        // Condition 1: Le deal doit avoir été soumis par un utilisateur.
                        // Condition 2: Cet utilisateur ne doit PAS être l'utilisateur actuel.
                        if (deal.submitted_by_username && deal.submitted_by_username !== currentUser) {
                            confirmButtonHtml = `<button class="btn btn-primary btn-small btn-confirm-price" data-price-id="${deal.price_id}" style="background-color: #27ae60; margin-left: 10px;">
                                <i class="bi bi-magic"></i> Confirmer
                            </button>`;
                        }
                        return `
                        <div style="display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #f0f0f0;">
                            <input type="radio" name="deal-radio-${itemIndex}" id="deal-${itemIndex}-${dealIndex}" class="deal-selector-radio" data-item-index="${itemIndex}" data-deal-index="${dealIndex}" ${isSelected ? 'checked' : ''}>
                            
                            <label for="deal-${itemIndex}-${dealIndex}" style="flex-grow: 1; margin-left: 8px; cursor: pointer; line-height: 1.2;">
                                <div style="font-weight: 600; color: #2c3e50; font-size: 0.95em;">${deal.name}</div>
                                <div style="font-size: 0.9em; color: #555;">
                                    ${deal.details} <span style="color: #ccc;">|</span> ${deal.store}
                                </div>
                            </label>
                            <i class="bi bi-info-circle text-primary btn-view-deal-details" 
                               style="cursor: pointer; font-size: 1.2em; margin-left: 10px;" 
                               data-item-index="${itemIndex}" 
                               data-deal-index="${dealIndex}"
                               title="Voir les détails du rabais">
                            </i>
                            ${confirmButtonHtml}
                            ${actionButtonsHtml}
                        </div>
                    `;
                }).join('');

                // On n'utilise plus de <select>, mais une série de boutons radio
                dealsHtml = `
                    <div class="deal-selector-group" data-item-index="${itemIndex}">
                        <p style="margin-top:0; margin-bottom: 5px; font-weight: bold;">Offres trouvées :</p>
                        ${optionsHtml}
                    </div>`;
            } else {
                dealsHtml = `<span>Aucun rabais ou prix communautaire trouvé</span>`;
            }

            const priceValue = item.selectedPrice !== undefined ? item.selectedPrice : '';

            itemElement.innerHTML = `
                <span class="item-name-grid">${item.name} (Qté: ${item.quantity})</span>
                <div class="item-deals-grid">
                    ${dealsHtml}
                    
                    <!-- ================== LIGNE AJOUTÉE ================== -->
                    <button 
                        class="btn btn-primary btn-small btn-submit-price" 
                        data-item-name="${item.name}" 
                        style="background-color: #16a085; margin-top: 8px;">
                        
                        <i class="bi bi-magic"></i> Soumettre un prix régulier
                    </button>
                    <!-- =================================================== -->

                </div>
                <div class="item-price-grid">
                    <label for="price-${itemIndex}" style="font-size: 0.9em;">Prix Final:</label>
                    <input type="text" id="price-${itemIndex}" class="item-price-input" data-item-index="${itemIndex}" value="${priceValue}" placeholder="0.00" style="width: 80px; text-align: right; padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                </div>
            `;
            optimizationDisplayContainer.appendChild(itemElement);
        });

        // Gérer la visibilité du bouton de recherche de prix
        findPricesBtn.style.display = hasItemsWithoutPrice ? 'inline-block' : 'none';

        // Ajouter le total à la fin
        const totalElement = document.createElement('div');
        totalElement.style.textAlign = 'right';
        totalElement.style.marginTop = '20px';
        totalElement.style.paddingTop = '10px';
        totalElement.style.borderTop = '2px solid #333';
        totalElement.style.fontSize = '1.2em';
        totalElement.style.fontWeight = 'bold';
        totalElement.innerHTML = `Total estimé: <span style="color: #27ae60;">${total.toFixed(2)} $</span>`;
        optimizationDisplayContainer.appendChild(totalElement);
    }

    async function handleConfirmPrice(event) {
        if (!event.target.classList.contains('btn-confirm-price')) {
            return; // Ne fait rien si ce n'est pas le bon bouton
        }

        const button = event.target;
        const priceId = button.dataset.priceId;
        const token = localStorage.getItem('authToken');

        if (!token) {
            alert("Veuillez vous connecter pour confirmer un prix.");
            return;
        }

        button.disabled = true;
        button.textContent = '...';

        try {
            const response = await apiCall(`/api/prices/${priceId}/confirm/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Authorization': `Token ${token}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Une erreur est survenue.');
            }
            
            button.textContent = 'Confirmé ✓';
            button.style.backgroundColor = '#7f8c8d';

            // Optionnel mais recommandé : rafraîchir la liste pour voir le nombre de confirmations augmenter.
            optimizeShoppingList();

        } catch (error) {
            alert(error.message);
            button.disabled = false;
            button.textContent = 'Confirmer'; // Réinitialiser le bouton en cas d'erreur
        }
    }

    // --- NOUVELLES FONCTIONS POUR LE SIGNALEMENT ---

    // Gère l'ouverture de la modale de signalement
    function openReportModal(event) {
        if (!event.target.classList.contains('btn-report-price')) {
            return;
        }
        const button = event.target;
        const priceId = button.dataset.priceId;
        const productName = button.dataset.productName;
        
        reportProductName.textContent = productName;
        hiddenReportPriceId.value = priceId;
        
        reportPriceModal.style.display = 'block';
    }

    // Gère la fermeture de la modale
    function closeReportModal() {
        reportPriceModal.style.display = 'none';
        reportPriceForm.reset();
    }

    // Gère la soumission du formulaire de signalement
    async function handleReportSubmit(event) {
        event.preventDefault();
        
        const priceId = hiddenReportPriceId.value;
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            alert("Veuillez vous connecter pour signaler un prix.");
            return;
        }
        
        const formData = new FormData(reportPriceForm);
        const reason = formData.get('report_reason');
        const comments = document.getElementById('report-comments').value;

        try {
            const response = await apiCall(`/api/prices/${priceId}/report/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Authorization': `Token ${token}`
                },
                body: JSON.stringify({ reason, comments })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
            
            alert(data.message);
            closeReportModal();

        } catch (error) {
            alert(error.message);
        }
    }
    
    function saveOptimizedList() {
        localStorage.setItem('savedOptimizedList', JSON.stringify(optimizedItems));
    }

    function handleDealSelection(event) {
        if (event.target.classList.contains('deal-selector')) {
            const activeElementId = document.activeElement ? document.activeElement.id : null;

            const itemIndex = parseInt(event.target.dataset.itemIndex, 10);
            const dealIndex = parseInt(event.target.value, 10);
            if (itemIndex >= 0 && itemIndex < optimizedItems.length) {
                const item = optimizedItems[itemIndex];
                if (dealIndex >= 0) {
                    const selectedDeal = item.deals[dealIndex];
                    item.selectedDeal = selectedDeal;
                    
                    const priceString = String(selectedDeal.price);
                    let priceForTotal = '';
                    
                    const singlePriceMatch = priceString.match(/\(([\d\.]+)\)/);
                    const mainPriceMatch = priceString.match(/^([\d\.\/]+)/);

                    if (singlePriceMatch && singlePriceMatch[1]) {
                            priceForTotal = singlePriceMatch[1];
                    } else if (mainPriceMatch && mainPriceMatch[1]) {
                        const pricePart = mainPriceMatch[1];
                        if (pricePart.includes('/')) {
                            const parts = pricePart.split('/');
                            if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
                                priceForTotal = (parseFloat(parts[1]) / parseFloat(parts[0])).toFixed(2);
                            }
                        } else {
                            priceForTotal = pricePart;
                        }
                    }
                    item.selectedPrice = priceForTotal;
                } else {
                    item.selectedDeal = null;
                    item.selectedPrice = '';
                }
                saveOptimizedList();
                renderOptimizedList();

                if (activeElementId) {
                    const newActiveElement = document.getElementById(activeElementId);
                    if (newActiveElement) newActiveElement.focus();
                }
            }
        }
    }
    
    function handlePriceChange(event) {
        if (event.target.classList.contains('item-price-input')) {
            const itemIndex = parseInt(event.target.dataset.itemIndex, 10);
            
            const activeElement = document.activeElement;
            const activeElementId = activeElement ? activeElement.id : null;
            const selectionStart = activeElement ? activeElement.selectionStart : null;
            const selectionEnd = activeElement ? activeElement.selectionEnd : null;

            if (itemIndex >= 0 && itemIndex < optimizedItems.length) {
                optimizedItems[itemIndex].selectedPrice = event.target.value;
                saveOptimizedList();
                renderOptimizedList(); // Re-rendre pour mettre à jour le total
            }

            if (activeElementId) {
                const newActiveElement = document.getElementById(activeElementId);
                if (newActiveElement) {
                    newActiveElement.focus();
                    if (selectionStart !== null && selectionEnd !== null) {
                        newActiveElement.setSelectionRange(selectionStart, selectionEnd);
                    }
                }
            }
        }
    }

    function loadSavedOptimizedList() {
        const savedList = JSON.parse(localStorage.getItem('savedOptimizedList'));
        if (savedList && Array.isArray(savedList) && savedList.length > 0) {
            optimizedItems = savedList;
            renderOptimizedList();
        }
    }
    
    // --- NOUVELLE FONCTION D'IMPRESSION ROBUSTE ---
    function printOptimizedList() {
        if (!optimizedItems || optimizedItems.length === 0) {
            alert("Veuillez d'abord optimiser votre liste pour pouvoir l'imprimer.");
            return;
        }

        const itemsToPrint = optimizedItems;
        let total = 0;
        const itemCount = itemsToPrint.length;

        // 1. Classification de la liste
        let bodyClass = 'liste-courte';
        if (itemCount > 70) {
            bodyClass = 'liste-tres-longue-2col';
        } else if (itemCount > 48) {
            bodyClass = 'liste-longue-2col';
        } else if (itemCount > 28) {
            bodyClass = 'liste-moyenne';
        }

        const printWindow = window.open('', '_blank');
        let printContent = `
            <html>
            <head>
                <title>Liste d'Épicerie Optimisée</title>
                <style>
                    /* Styles de base pour la structure */
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        margin: 0;
                    }
                    .print-body {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        padding: 5mm; /* Marges gérées par le padding */
                        box-sizing: border-box;
                    }
                    h1 { 
                        color: #2c3e50; 
                        border-bottom: 2px solid #ccc; 
                        padding-bottom: 5px; 
                        margin: 0 0 5px 0;
                    }
                    .print-container {
                        flex-grow: 1; /* Prend tout l'espace disponible */
                        overflow: hidden; /* Empêche le débordement du conteneur lui-même */
                    }
                    .print-item {
                        border-bottom: 1px solid #eee;
                        word-wrap: break-word;
                    }
                    .item-title { font-weight: bold; font-size: 1.05em; }
                    .item-deal, .item-no-deal { font-size: 0.9em; padding-left: 10px; }
                    .item-deal { color: #27ae60; }
                    .item-no-deal { color: #7f8c8d; font-style: italic; }
                    .total-footer {
                        text-align: right;
                        padding-top: 5px;
                        border-top: 2px solid #333;
                        font-weight: bold;
                        flex-shrink: 0; /* Empêche le pied de page de rétrécir */
                    }
                    
                    /* Styles spécifiques aux classes de liste */
                    .liste-courte { font-size: 11pt; line-height: 1.4; }
                    .liste-courte .print-item { padding: 3px 0; }
                    
                    .liste-moyenne { font-size: 9.5pt; line-height: 1.3; }
                    .liste-moyenne .print-item { padding: 2px 0; }

                    .liste-longue-2col { font-size: 8.5pt; line-height: 1.25; }
                    .liste-longue-2col .print-item { padding: 1px 0; }
                    .liste-longue-2col .print-container { column-count: 2; column-gap: 12px; }
                    .liste-longue-2col .print-item { break-inside: avoid; }

                    .liste-tres-longue-2col { font-size: 7.5pt; line-height: 1.2; }
                    .liste-tres-longue-2col .print-item { padding: 1px 0; }
                    .liste-tres-longue-2col .print-container { column-count: 2; column-gap: 12px; }
                    .liste-tres-longue-2col .print-item { break-inside: avoid; }

                    @media print {
                        @page {
                            size: letter portrait;
                            margin: 0; /* Les marges sont gérées par le padding du .print-body */
                        }
                            html, body {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                </style>
            </head>
            <body class="${bodyClass}">
                <div class="print-body">
                    <h1>Liste d'Épicerie Complète</h1>
                    <div class="print-container">`;
        
        itemsToPrint.forEach(item => {
            total += parseFloat(item.selectedPrice) || 0;
            let dealHtml;
            if (item.selectedDeal) {
                const finalPriceText = item.selectedPrice ? `<strong>$${parseFloat(item.selectedPrice).toFixed(2)}</strong>` : `(${item.selectedDeal.price})`;
                dealHtml = `<div class="item-deal">↳ <strong>${item.selectedDeal.store}</strong>: ${item.selectedDeal.name} - Prix final: ${finalPriceText}</div>`;
            } else {
                    const finalPriceText = item.selectedPrice ? `<strong>$${parseFloat(item.selectedPrice).toFixed(2)}</strong>` : `(aucun prix entré)`;
                dealHtml = `<div class="item-no-deal">↳ Aucun rabais sélectionné - Prix manuel: ${finalPriceText}</div>`;
            }
            printContent += `<div class="print-item"><div class="item-title">${item.name} (Qté: ${item.quantity})</div>${dealHtml}</div>`;
        });

        printContent += `</div>`; // .print-container
        printContent += `<div class="total-footer">Total Estimé: ${total.toFixed(2)} $</div>`;
        printContent += `</div></body></html>`; // .print-body

        printWindow.document.write(printContent);
        printWindow.document.close();
        
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

    async function optimizeShoppingList() {
        const optimizationDisplayContainer = document.getElementById('optimization-display');
        let shoppingList = [];

        if (optimizationDisplayContainer) {
            optimizationDisplayContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div><p>Récupération de votre liste...</p></div>';
        }

        // 1. Tenter de récupérer depuis le serveur
        try {
            const serverList = await apiCall('shopping-list', 'GET');
            if (Array.isArray(serverList) && serverList.length > 0) {
                console.log("Utilisation de la liste SERVEUR");
                shoppingList = serverList;
            } else {
                throw new Error("Liste serveur vide"); // Force le passage au catch pour le fallback
            }
        } catch (error) {
            console.log("Serveur vide ou erreur, utilisation du CACHE LOCAL");
            // 2. Fallback sur le LocalStorage
            shoppingList = JSON.parse(localStorage.getItem('shoppingList')) || [];
        }

        // 3. Si toujours vide, on arrête
        if (shoppingList.length === 0) {
            if (optimizationDisplayContainer) {
                optimizationDisplayContainer.innerHTML = '<p class="placeholder-text">Votre liste d\'épicerie est vide. Ajoutez des articles depuis la page principale.</p>';
            }
            return;
        }

        const selectedStores = Array.from(document.querySelectorAll('.store-checkbox:checked')).map(node => node.value);
        if (selectedStores.length === 0) {
            alert("Veuillez sélectionner au moins un commerce pour lancer l'optimisation.");
            if (optimizationDisplayContainer) optimizationDisplayContainer.innerHTML = '';
            return;
        }

        if (optimizationDisplayContainer) {
            optimizationDisplayContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-success" role="status"></div><p>L\'IA cherche les meilleurs prix...</p></div>';
        }

        try {
            const response = await apiCall('optimize', 'POST', {
                items: shoppingList,
                stores: selectedStores
            });

            optimizedItems = response;
            renderOptimizedList();
            saveOptimizedList();

        } catch (error) {
            console.error("Erreur lors de l'optimisation:", error);
            if (optimizationDisplayContainer) {
                optimizationDisplayContainer.innerHTML = `<p class="text-danger">Une erreur est survenue lors de l'optimisation : ${error.message}</p>`;
            }
        }
    }

    function generateRoute() {
        const routeDisplayContainer = document.getElementById('route-display');
        if (!routeDisplayContainer) { console.error("Element #route-display not found!"); return; }

        if (optimizedItems.length === 0) {
            routeDisplayContainer.innerHTML = '<p class="placeholder-text">Veuillez d\'abord optimiser votre liste.</p>';
            return;
        }
        const storesToVisit = [...new Set(optimizedItems.filter(item => item.selectedDeal && item.selectedDeal.store).map(item => item.selectedDeal.store))];

        if (storesToVisit.length === 0) {
            routeDisplayContainer.innerHTML = '<p class="placeholder-text">Aucune offre sélectionnée. Choisissez des articles dans la liste optimisée pour générer un itinéraire.</p>';
            return;
        }
        
        routeDisplayContainer.innerHTML = '<h3>Magasins à visiter :</h3>';
        const routeList = document.createElement('ol');
        routeList.id = 'route-list';
        storesToVisit.forEach(store => {
            const li = document.createElement('li');
            li.textContent = store;
            routeList.appendChild(li);
        });
        routeDisplayContainer.appendChild(routeList);
    }

    function formatPrice(item) {
        if (item.member_price) return `${item.member_price} ${item.unit || ''} (Membre)`;
        if (item.price && typeof item.price === 'string' && item.price.includes('/')) return `${item.price} ${item.unit || ''}${item.single_price ? ` (${item.single_price})` : ''}`;
        if (item.price) return `${item.price} ${item.unit || ''}`;
        return "Prix non disponible";
    }

    function chargerCommercesDepuisDB(shouldRender = true) {
        return apiCall('/api/commerces/')
            .then(commercesFromDB => {
                if (!Array.isArray(commercesFromDB)) {
                    throw new Error('La réponse des commerces n\'est pas un tableau.');
                }
                const allStores = new Map();
                manualStores.forEach(store => allStores.set(store.name.toLowerCase(), store));
                commercesFromDB.forEach(commerce => {
                    allStores.set(commerce.nom.toLowerCase(), {
                        name: commerce.nom,
                        address: commerce.adresse,
                        website: commerce.site_web
                    });
                });
                manualStores = Array.from(allStores.values());
                saveManualStores();
                if (shouldRender) {
                    renderAllStores();
                }
            })
            .catch(error => {
                console.error("Erreur lors du chargement des commerces depuis la DB:", error);
                if (shouldRender) {
                    renderAllStores();
                }
            });
    }

    // Fonction pour charger les commerces (depuis la DB et le localStorage)
    function chargerCommerces() {
        // On charge d'abord ceux qui sont sauvegardés localement
        loadManualStores(); 
        // Ensuite, on met à jour avec ceux de la base de données
        return apiCall('/api/commerces/')
            .then(response => response.json())
            .then(commercesFromDB => {
                const allStoresMap = new Map();
                manualStores.forEach(store => allStoresMap.set(store.name.toLowerCase(), store));
                commercesFromDB.forEach(commerce => {
                    allStoresMap.set(commerce.nom.toLowerCase(), {
                        name: commerce.nom,
                        address: commerce.adresse,
                        website: commerce.site_web
                    });
                });
                manualStores = Array.from(allStoresMap.values());
                saveManualStores();
            });
    }

    // Fonction pour charger les données des circulaires actives
    function chargerCirculairesActives() {
        return apiCall('/api/circulaires-actives/')
            .then(data => {
                flyerData = data;
                // Sauvegarder dans localStorage pour la page d'inventaire
                localStorage.setItem('flyerData', JSON.stringify(flyerData)); 
            });
    }

    // Fonction pour charger les rabais (pour la section "Rabais Actifs")
    function chargerRabaisActifs() {
        return apiCall('/api/rabais-actifs/')
            .then(data => {
                activeDeals = data;
                renderRabaisGrid(data); // Met à jour l'affichage de cette section
            });
    }

    function chargerDonneesCirculaires(shouldRender = true) {
        return apiCall('/api/circulaires-actives/')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Erreur réseau lors de la récupération des circulaires.');
                }
                return response.json();
            })
            .then(data => {
                flyerData = data;
                saveFlyerData();
                if (shouldRender) {
                    renderAllStores();
                }
            })
            .catch(error => {
                console.error("Erreur lors du chargement des données de circulaires:", error);
                if (shouldRender) {
                    renderAllStores();
                }
            });
    }

    async function importFlyerData(event) {
        event.preventDefault();
        const jsonString = flyerJsonInput.value.trim();
        if (!jsonString) {
            alert("Veuillez coller le contenu JSON de la circulaire.");
            return;
        }

        let dataToImport;
        try {
            // Étape 1 : Valider que le texte est un JSON correct
            dataToImport = JSON.parse(jsonString);
        } catch (error) {
            alert("Le texte fourni n'est pas un JSON valide. Veuillez vérifier le format.");
            console.error("Erreur de parsing JSON:", error);
            return;
        }

        try {
            // Étape 2 : Utiliser correctement la fonction `apiCall`
            const result = await apiCall('/api/import-flyer/', 'POST', dataToImport);
            
            alert(result.message);
            flyerJsonInput.value = '';
            
            // Étape 3 : Recharger toutes les données pour mettre à jour la page
            await Promise.all([
                chargerCommercesDepuisDB(false),
                chargerCirculairesActives(),
                chargerRabaisActifs()
            ]);
            
            renderAllStores();
            
        } catch (error) {
            console.error('Erreur lors de l\'importation via API:', error);
            alert(`Une erreur est survenue lors de l'importation : ${error.message}`);
        }
    }
    
    function openFlyerModal(event) {
        const storeName = event.target.dataset.storeName;
        const flyerContent = flyerData[storeName];

        if (!flyerContent || !Array.isArray(flyerContent.categories)) {
            console.error("Le contenu de la circulaire est invalide ou manque la clé 'categories'.");
            return;
        }
        
        modalTitle.textContent = `Circulaire - ${storeName}`;
        modalBody.innerHTML = '';

        if (flyerContent.categories.length === 0) {
                modalBody.innerHTML = '<p class="placeholder-text">Cette circulaire ne contient aucun article.</p>';
        } else {
            flyerContent.categories.forEach(category => {
                if(category.category_name) {
                    const categoryTitle = document.createElement('h4');
                    categoryTitle.textContent = category.category_name;
                    categoryTitle.style.marginTop = '15px';
                    categoryTitle.style.paddingBottom = '5px';
                    categoryTitle.style.borderBottom = '1px solid #ccc';
                    modalBody.appendChild(categoryTitle);
                }

                if (category.items && Array.isArray(category.items)) {
                    category.items.forEach(item => {
                        const itemElement = document.createElement('div');
                        itemElement.className = 'flyer-item';
                        const priceInfo = formatPrice(item);
                        itemElement.innerHTML = `<span class="flyer-item-name">${item.name}</span> <span class="flyer-item-price">${priceInfo}</span>`;
                        modalBody.appendChild(itemElement);
                    });
                }
            });
        }
        
        flyerModal.style.display = 'block';
    }

    function closeFlyerModal() { flyerModal.style.display = 'none'; }
    
    // --- NOUVELLES FONCTIONS POUR LA RECHERCHE DE PRIX ---
    function generatePriceFinderPrompt() {
        const itemsToPrice = optimizedItems.filter(item => !item.selectedPrice || parseFloat(item.selectedPrice) === 0);

        if (itemsToPrice.length === 0) {
            priceFinderPromptOutput.style.display = 'none';
            document.querySelector('#price-importer-section p').textContent = "Tous les articles ont déjà un prix. Aucune recherche n'est nécessaire.";
            return;
        }

        const itemNames = itemsToPrice.map(item => `    "${item.name}"`).join(',\n');

        const promptText = `Agis comme un assistant d'épicerie pour le Québec, Canada.
Ta tâche est de trouver le prix courant et non en solde pour la liste d'articles suivante.

Fournis la réponse uniquement sous la forme d'un tableau JSON. N'inclus aucun texte, explication ou formatage avant ou après le bloc de code JSON.

Chaque objet dans le tableau doit avoir exactement deux clés :
1. "name" : une chaîne de caractères (string) qui doit correspondre EXACTEMENT au nom de l'article fourni.
2. "price" : un nombre (number) représentant le prix, par exemple 4.99.

Voici la liste des articles à rechercher :
[
${itemNames}
]

Voici un exemple de la sortie attendue :
\`\`\`json
[
{
"name": "Laitue Iceberg",
"price": 2.99
},
{
"name": "Pain blanc en tranches",
"price": 3.79
}
]
\`\`\`

Maintenant, génère le JSON pour la liste que je t'ai fournie.`;

        priceFinderPromptTextarea.value = promptText;
        priceFinderPromptOutput.style.display = 'block';
    }

    function importPricesFromJson() {
        const jsonString = importPricesJsonTextarea.value.trim();
        if (!jsonString) {
            alert("Veuillez coller le JSON fourni par l'IA dans la zone de texte.");
            return;
        }

        try {
            const importedPrices = JSON.parse(jsonString);
            if (!Array.isArray(importedPrices)) {
                throw new Error("Le JSON doit être un tableau (une liste) d'articles.");
            }

            let updatedCount = 0;
            importedPrices.forEach(importedItem => {
                if (importedItem && importedItem.name && typeof importedItem.price === 'number') {
                    const itemIndex = optimizedItems.findIndex(optItem => 
                        optItem.name === importedItem.name && 
                        (!optItem.selectedPrice || parseFloat(optItem.selectedPrice) === 0)
                    );
                    
                    if (itemIndex !== -1) {
                        optimizedItems[itemIndex].selectedPrice = importedItem.price.toFixed(2);
                        updatedCount++;
                    }
                }
            });

            if (updatedCount > 0) {
                saveOptimizedList();
                renderOptimizedList();
                importPricesJsonTextarea.value = '';
                priceFinderContainer.style.display = 'none';
                alert(`${updatedCount} prix ont été mis à jour avec succès !`);
            } else {
                alert("Aucun prix n'a été mis à jour. Vérifiez que les noms dans le JSON correspondent aux articles sans prix dans votre liste.");
            }

        } catch (error) {
            console.error("Erreur d'importation de prix:", error);
            alert("Erreur lors de l'importation : " + error.message + ". Assurez-vous que le JSON est valide et respecte le format demandé.");
        }
    }
    
    // --- MISE À JOUR DE LA FONCTION DE RENDU DES RABAIS ---
    function renderRabaisGrid(rabais) {
        const container = document.getElementById('rabais-actifs-display');
        container.innerHTML = '';
        if (rabais.length === 0) {
            container.innerHTML = '<p class="placeholder-text">Aucun rabais actif trouvé.</p>';
            return;
        }

        const rabaisParCommerce = rabais.reduce((acc, item) => {
            const store = item.commerce_nom;
            if (!acc[store]) acc[store] = [];
            acc[store].push(item);
            return acc;
        }, {});

        const sortedStores = Object.keys(rabaisParCommerce).sort();

        sortedStores.forEach(storeName => {
            const itemsDuCommerce = rabaisParCommerce[storeName];
            const storeDetails = document.createElement('details');
            storeDetails.className = 'store-rabais-group';
            storeDetails.open = true; // Ouvert par défaut avant application de l'état sauvegardé

            const storeSummary = document.createElement('summary');
            storeSummary.className = 'store-rabais-summary';
            storeSummary.innerHTML = `${storeName} <span class="deal-count">${itemsDuCommerce.length} rabais</span>`;
            storeDetails.appendChild(storeSummary);

            const rabaisParCategorie = itemsDuCommerce.reduce((acc, item) => {
                const category = item.categorie_nom || "Non classé";
                if (!acc[category]) acc[category] = [];
                acc[category].push(item);
                return acc;
            }, {});
            
            Object.keys(rabaisParCategorie).sort().forEach(categoryName => {
                const categoryDetails = document.createElement('details');
                categoryDetails.className = 'category-rabais-group';
                categoryDetails.innerHTML = `<summary class="category-rabais-summary">${categoryName} <span class="deal-count">${rabaisParCategorie[categoryName].length}</span></summary>`;
                
                const grid = document.createElement('div');
                grid.className = 'rabais-grid';
                rabaisParCategorie[categoryName].forEach(item => {
                    const confirmButtonHtml = (item.submitted_by_username && item.submitted_by_username !== localStorage.getItem('username')) ?
                        `<button class="btn btn-small btn-confirm-price" data-price-id="${item.price_id}" style="background-color: #27ae60; margin-top: 8px;">Confirmer</button>` : '';

                    grid.innerHTML += `
                        <div class="rabais-item">
                            <div>
                                <span class="produit-nom">${item.produit_nom}</span>
                                <span class="commerce-nom">${item.commerce_nom}</span>
                            </div>
                            <div style="text-align: right; flex-shrink: 0;">
                                <div class="prix-info">${item.details_prix || item.prix + ' $'}</div>
                                ${confirmButtonHtml}
                            </div>
                        </div>`;
                });
                categoryDetails.appendChild(grid);
                storeDetails.appendChild(categoryDetails);
            });
            container.appendChild(storeDetails);
        });
        
        // --- MODIFICATION : Applique l'état sauvegardé ---
        applyAccordionStates();
    }

    function chargerRabaisActifs() {
        return apiCall('/api/rabais-actifs/') // On appelle l'API des rabais
            .then(data => {
                activeDeals = data; 
                renderRabaisGrid(data); // Met à jour la section "Rabais Actifs"
            })
            .catch(error => {
                console.error("Erreur chargement rabais:", error);
                const container = document.getElementById('rabais-actifs-display');
                container.innerHTML = '<p class="placeholder-text" style="color: red;">Impossible de charger les rabais pour le moment.</p>';
            });
    }

    function chargerPrixActifs() {
        return apiCall('/api/active-prices/')
            .then(data => {
                activeDeals = data; 
                renderRabaisGrid(data);
            })
            .catch(error => {
                console.error("Erreur:", error);
                const container = document.getElementById('rabais-actifs-display');
                container.innerHTML = '<p class="placeholder-text" style="color: red;">Impossible de charger les prix pour le moment.</p>';
            });
    }

    function viewDealDetails(event) {
        event.stopPropagation(); // Empêche la sélection du bouton radio
        
        const icon = event.target;
        if (!icon.classList.contains('btn-view-deal-details')) return;

        const itemIndex = parseInt(icon.dataset.itemIndex, 10);
        const dealIndex = parseInt(icon.dataset.dealIndex, 10);
        
        // Vérification de sécurité
        if (!optimizedItems[itemIndex] || !optimizedItems[itemIndex].deals[dealIndex]) {
            console.error("Données du rabais introuvables");
            return;
        }

        const deal = optimizedItems[itemIndex].deals[dealIndex];
        
        // --- Debug : Voir toutes les données disponibles dans la console ---
        console.log("Détails complets du rabais :", deal);

        // 1. En-tête (Magasin, Nom)
        document.getElementById('detail-modal-store').textContent = deal.store;
        document.getElementById('detail-modal-product').textContent = deal.name || deal.product_name || "Produit inconnu";

        // 2. Badges (Marque, Catégorie)
        const brandEl = document.getElementById('detail-modal-brand');
        if (deal.brand && deal.brand !== 'null') {
            brandEl.textContent = deal.brand;
            brandEl.style.display = 'inline-block';
        } else {
            brandEl.style.display = 'none';
        }

        const catEl = document.getElementById('detail-modal-category');
        if (deal.category_name || deal.categorie_nom) {
            catEl.textContent = deal.category_name || deal.categorie_nom;
            catEl.style.display = 'inline-block';
        } else {
            catEl.style.display = 'none';
        }

        // 3. Prix
        // On affiche le prix principal (price ou details)
        let mainPrice = deal.price ? `${deal.price} $` : deal.details;
        // Si c'est un texte genre "2 / 5.00$", on l'affiche tel quel
        if (deal.details && deal.details.includes('/')) {
            mainPrice = deal.details;
        }
        document.getElementById('detail-modal-price').textContent = mainPrice;

        // Unité (ex: "l'unité", "/lb")
        const unitEl = document.getElementById('detail-modal-price-unit');
        if (deal.unit) {
            unitEl.textContent = `(${deal.unit})`;
        } else {
            unitEl.textContent = '';
        }

        // 4. Prix comparatifs (Régulier / Membre)
        const rowReg = document.getElementById('detail-row-regular');
        if (deal.regular_price) {
            document.getElementById('detail-val-regular').textContent = `${deal.regular_price} $`;
            rowReg.style.display = 'block';
        } else {
            rowReg.style.display = 'none';
        }

        const rowMem = document.getElementById('detail-row-member');
        if (deal.member_price) {
            document.getElementById('detail-val-member').textContent = `${deal.member_price} $`;
            rowMem.style.display = 'block';
        } else {
            rowMem.style.display = 'none';
        }

        // 5. Quantité physique (g, ml, paquet)
        const rowQty = document.getElementById('detail-row-quantity');
        if (deal.quantity) {
            document.getElementById('detail-val-quantity').textContent = deal.quantity;
            rowQty.style.display = 'block';
        } else {
            rowQty.style.display = 'none';
        }

        // 6. Description
        const desc = deal.description || deal.details || "";
        const descEl = document.getElementById('detail-modal-desc');
        if (desc && desc !== mainPrice) { // Éviter de répéter le prix s'il est dans details
            descEl.textContent = desc;
            descEl.parentElement.style.display = 'block';
        } else {
            descEl.parentElement.style.display = 'none';
        }

        // 7. Dates
        const dateDebut = deal.date_debut || deal.start_date || "?";
        const dateFin = deal.date_fin || deal.end_date || "?";
        document.getElementById('detail-modal-dates').textContent = `Du ${dateDebut} au ${dateFin}`;

        // 8. Source
        const typeText = deal.type === 'communautaire' ? "Communautaire (Utilisateur)" : "Circulaire";
        document.getElementById('detail-modal-source').textContent = typeText;

        // Afficher la modale
        document.getElementById('deal-details-modal').style.display = 'block';
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
     * Réorganisation Intelligente
     * "Défragmente" la grille en comblant les espaces vides.
     */
    function smartAutoArrange() {
        if (!grid) return;
        grid.batchUpdate();
        
        // Trie les widgets par position visuelle pour garder l'ordre logique
        const nodes = grid.engine.nodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
        
        // Force le re-positionnement automatique
        nodes.forEach(node => {
            grid.update(node.el, { x: undefined, y: undefined, autoPosition: true });
        });
        
        grid.commit();
    }

    async function initializePage() {
        // 1. Initialiser GridStack (la coquille vide)
        initializeGrid();

        // 2. ÉTAPE CRITIQUE : Charger la disposition AVANT de toucher au contenu
        // On attend que GridStack ait fini de bouger les boîtes avant de les remplir.
        if (localStorage.getItem('authToken')) {
            try {
                const layout = await apiCall('/api/user/layout?page=optimiseur', 'GET');
                if (grid && layout && layout.length > 0) {
                    // grid.load(layout) est synchrone dans son exécution, mais change le DOM.
                    // On le fait ici pour que le DOM soit stabilisé pour la suite.
                    grid.load(layout);
                }
            } catch (error) {
                console.error("Erreur de chargement de la disposition:", error);
                if (String(error).includes('401') || String(error).includes('403')) {
                    handleLogout();
                }
            }
        }

        // 3. Capturer les références aux éléments du DOM
        // (On le fait MAINTENANT, car GridStack a peut-être recréé certains conteneurs)
        findStoresBtn = document.getElementById('findStoresBtn');
        sortStoresBtn = document.getElementById('sortStoresBtn');
        optimizeListBtn = document.getElementById('optimizeListBtn');
        printListBtn = document.getElementById('printListBtn');
        generateRouteBtn = document.getElementById('generateRouteBtn');
        addStoreUrlForm = document.getElementById('addStoreUrlForm');
        manualStoreUrlInput = document.getElementById('manualStoreUrl');
        importFlyerForm = document.getElementById('importFlyerForm');
        flyerJsonInput = document.getElementById('flyerJsonInput');
        flyerModal = document.getElementById('flyerModal');
        modalTitle = document.getElementById('modal-title');
        modalBody = document.getElementById('modal-body');
        closeBtn = document.querySelector('.close-btn');
        manageFlyersBtn = document.getElementById('manageFlyersBtn');
        flyerManagerModal = document.getElementById('flyerManagerModal');
        modalManagerBody = document.getElementById('modal-manager-body');
        closeBtnManager = document.querySelector('.close-btn-manager');
        editStoreModal = document.getElementById('editStoreModal');
        closeBtnEdit = document.querySelector('.close-btn-edit');
        editStoreForm = document.getElementById('editStoreForm');
        copyAiPromptBtn = document.getElementById('copy-ai-prompt-btn');
        aiPromptTextarea = document.getElementById('ai-prompt-textarea');
        findPricesBtn = document.getElementById('findPricesBtn');
        priceFinderContainer = document.getElementById('price-finder-container');
        priceFinderPromptOutput = document.getElementById('price-finder-prompt-output');
        priceFinderPromptTextarea = document.getElementById('price-finder-prompt-textarea');
        copyPriceFinderPromptBtn = document.getElementById('copy-price-finder-prompt-btn');
        importPricesJsonTextarea = document.getElementById('import-prices-json');
        importPricesBtn = document.getElementById('importPricesBtn');
        priceModal = document.getElementById('submit-price-modal');
        closePriceModalBtn = document.getElementById('close-price-modal-btn');
        submitPriceForm = document.getElementById('submit-price-form');
        modalProductName = document.getElementById('modal-product-name');
        hiddenProductNameInput = document.getElementById('hidden-product-name');
        storeSelect = document.getElementById('modal-store-select');
        priceInput = document.getElementById('modal-price-input');
        addProductModal = document.getElementById('add-product-modal');
        closeAddProductModalBtn = document.getElementById('close-add-product-modal-btn');
        addProductForm = document.getElementById('add-product-form');
        newProductNameDisplay = document.getElementById('new-product-name-display');
        hiddenNewProductNameInput = document.getElementById('hidden-new-product-name');
        addDealBtn = document.getElementById('add-deal-btn');
        submitDealModal = document.getElementById('submit-deal-modal');
        closeDealModalBtn = document.getElementById('close-deal-modal-btn');
        submitDealForm = document.getElementById('submit-deal-form');
        reportPriceModal = document.getElementById('report-price-modal');
        closeReportModalBtn = document.getElementById('close-report-modal-btn');
        reportPriceForm = document.getElementById('report-price-form');
        reportProductName = document.getElementById('report-product-name');
        hiddenReportPriceId = document.getElementById('hidden-report-price-id');
        optimizationDisplay = document.getElementById('optimization-display');
        autoArrangeBtn = document.getElementById('auto-arrange-btn');
        
        // 4. Attacher les écouteurs d'événements
        if (findStoresBtn) findStoresBtn.addEventListener('click', findNearbyStores);
        if (sortStoresBtn) sortStoresBtn.addEventListener('click', sortStoresByDistance);
        if (optimizeListBtn) optimizeListBtn.addEventListener('click', optimizeShoppingList);
        if (printListBtn) printListBtn.addEventListener('click', printOptimizedList);
        if (generateRouteBtn) generateRouteBtn.addEventListener('click', generateRoute);
        if (addStoreUrlForm) addStoreUrlForm.addEventListener('submit', addStoreFromUrl);
        if (importFlyerForm) importFlyerForm.addEventListener('submit', importFlyerData);
        if (optimizationDisplay) {
            optimizationDisplay.addEventListener('change', handleDealSelection);
            optimizationDisplay.addEventListener('input', handlePriceChange);
            optimizationDisplay.addEventListener('dragstart', (e) => { if (e.target.classList.contains('optimized-item')) { draggedItemIndex = parseInt(e.target.dataset.index, 10); e.target.classList.add('dragging'); } });
            optimizationDisplay.addEventListener('dragover', (e) => { e.preventDefault(); const target = e.target.closest('.optimized-item'); if (target && parseInt(target.dataset.index, 10) !== draggedItemIndex) { document.querySelectorAll('.optimized-item.drag-over').forEach(el => el.classList.remove('drag-over')); target.classList.add('drag-over'); } });
            optimizationDisplay.addEventListener('dragleave', (e) => { if (e.target.classList.contains('optimized-item')) { e.target.classList.remove('drag-over'); } });
            optimizationDisplay.addEventListener('drop', (e) => { e.preventDefault(); const dropTarget = e.target.closest('.optimized-item'); if (dropTarget) { const dropIndex = parseInt(dropTarget.dataset.index, 10); const itemToMove = optimizedItems.splice(draggedItemIndex, 1)[0]; optimizedItems.splice(dropIndex, 0, itemToMove); saveOptimizedList(); renderOptimizedList(); } });
            optimizationDisplay.addEventListener('dragend', (e) => { document.querySelectorAll('.optimized-item.dragging, .optimized-item.drag-over').forEach(el => el.classList.remove('dragging', 'drag-over')); draggedItemIndex = null; });
            optimizationDisplay.addEventListener('click', openPriceModal);
            optimizationDisplay.addEventListener('click', viewDealDetails); 
        }
        if (copyAiPromptBtn) copyAiPromptBtn.addEventListener('click', copyAiPrompt);
        if (closeBtn) closeBtn.addEventListener('click', closeFlyerModal);
        if (manageFlyersBtn) manageFlyersBtn.addEventListener('click', openFlyerManagerModal);
        if (closeBtnManager) closeBtnManager.addEventListener('click', closeFlyerManagerModal);
        if (closeBtnEdit) closeBtnEdit.addEventListener('click', closeStoreEditModal);
        if (editStoreForm) editStoreForm.addEventListener('submit', handleStoreEditFormSubmit);
        if (findPricesBtn) findPricesBtn.addEventListener('click', () => {
            const isVisible = priceFinderContainer.style.display === 'block';
            priceFinderContainer.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                generatePriceFinderPrompt();
            }
        });
        if (copyPriceFinderPromptBtn) copyPriceFinderPromptBtn.addEventListener('click', () => {
            priceFinderPromptTextarea.select();
            document.execCommand('copy');
            const originalText = copyPriceFinderPromptBtn.textContent;
            copyPriceFinderPromptBtn.textContent = 'Copié !';
            setTimeout(() => { copyPriceFinderPromptBtn.textContent = originalText; }, 2000);
        });
        if (importPricesBtn) importPricesBtn.addEventListener('click', importPricesFromJson);
        if (optimizationDisplay) optimizationDisplay.addEventListener('click', openReportModal);
        if (optimizationDisplay) optimizationDisplay.addEventListener('click', handleConfirmPrice);            
        if (closePriceModalBtn) closePriceModalBtn.addEventListener('click', closePriceModal);
        if (submitPriceForm) submitPriceForm.addEventListener('submit', handlePriceSubmit);
        if (addProductForm) addProductForm.addEventListener('submit', handleAddProductSubmit);
        if (submitDealForm) submitDealForm.addEventListener('submit', handleDealSubmit);
        if (addDealBtn) addDealBtn.addEventListener('click', () => submitDealModal.style.display = 'block');
        if (closeAddProductModalBtn) closeAddProductModalBtn.addEventListener('click', () => addProductModal.style.display = 'none');
        if (closeDealModalBtn) closeDealModalBtn.addEventListener('click', () => submitDealModal.style.display = 'none');
        if (closeReportModalBtn) closeReportModalBtn.addEventListener('click', closeReportModal);
        if (reportPriceForm) reportPriceForm.addEventListener('submit', handleReportSubmit);
        if (autoArrangeBtn) {
            autoArrangeBtn.addEventListener('click', autoArrangeGrid);
        }

        const rabaisActifsDisplay = document.getElementById('rabais-actifs-display');
        if (rabaisActifsDisplay) {
            rabaisActifsDisplay.addEventListener('click', handleConfirmPrice);
            rabaisActifsDisplay.addEventListener('toggle', (event) => {
                if (event.target.classList.contains('store-rabais-group')) {
                    saveAccordionStates();
                }
            }, true);
        }

        const searchRabaisInput = document.getElementById('search-rabais-input');
        if (searchRabaisInput) {
            searchRabaisInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const filteredDeals = activeDeals.filter(deal => 
                    deal.produit_nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(searchTerm)
                );
                renderRabaisGrid(filteredDeals);

                if (searchTerm.length > 1) {
                    document.querySelectorAll('#rabais-actifs-display details').forEach(details => {
                        details.open = true;
                    });
                }
            });
        }
        
        // 5. Charger les données initiales
        // MAINTENANT que le GridStack est stable, on peut remplir les cases.
        loadFlyerData();
        loadManualStores();
        loadSavedOptimizedList();
        await loadStoresIntoModal();

        Promise.all([
            chargerCirculairesActives(),
            chargerRabaisActifs(),
            chargerCommercesDepuisDB(false)
        ]).then(() => {
            console.log("Données de circulaires, rabais et commerces chargées.");
            renderAllStores();
        }).catch(error => {
            console.error("Une erreur est survenue lors du chargement des données initiales:", error);
        });

        // On attend un petit délai pour s'assurer que le DOM est rendu
        setTimeout(() => {
            setupWidgetMinimization();
        }, 100);
    }
    
    // --- PARTIE 4 : DÉMARRAGE ---
    initializePage();
    
    const dealDetailsModal = document.getElementById('deal-details-modal');
    const closeDetailModalBtn = document.getElementById('close-detail-modal-btn');
    const btnCloseDetailModal = document.getElementById('btn-close-detail-modal');

    if (closeDetailModalBtn) closeDetailModalBtn.addEventListener('click', () => dealDetailsModal.style.display = 'none');
    if (btnCloseDetailModal) btnCloseDetailModal.addEventListener('click', () => dealDetailsModal.style.display = 'none');

    // Écouteur global pour fermer les modales en cliquant à l'extérieur
    window.addEventListener('click', (event) => {
        if (event.target == flyerModal) closeFlyerModal();
        if (event.target == flyerManagerModal) closeFlyerManagerModal();
        if (event.target == editStoreModal) closeStoreEditModal();
        if (event.target == priceModal) closePriceModal();
        if (event.target == addProductModal) addProductModal.style.display = 'none';
        if (event.target == submitDealModal) submitDealModal.style.display = 'none';
        if (event.target == reportPriceModal) closeReportModal();
        if (event.target == dealDetailsModal) dealDetailsModal.style.display = 'none';
    });
    reorganizeBtn = document.getElementById('reorganize-layout-btn');
    compactBtn = document.getElementById('compact-layout-btn');
    
    if (reorganizeBtn) {
        reorganizeBtn.addEventListener('click', (e) => { e.preventDefault(); applyLayoutPreset(OPTIMISEUR_LAYOUT_PRESET); });
    }
    if (compactBtn) {
        compactBtn.addEventListener('click', (e) => { e.preventDefault(); if (grid) grid.compact(); });
    }
    // AJOUT DU LISTENER
    if (smartArrangeBtn) {
        smartArrangeBtn.addEventListener('click', (e) => { e.preventDefault(); smartAutoArrange(); });
    }
});