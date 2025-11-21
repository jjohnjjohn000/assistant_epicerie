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

async function apiCall(endpoint, method, body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken')
    };
    const token = localStorage.getItem('authToken');
    if (token) {
        headers['Authorization'] = `Token ${token}`;
    }
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    // 1. On retire un préfixe /api/ si l'appelant l'a inclus par erreur.
    let cleanEndpoint = endpoint.startsWith('/api/') ? endpoint.substring(5) : endpoint;
    
    // 2. On retire un éventuel slash au début.
    cleanEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint.substring(1) : cleanEndpoint;
    
    // 3. On reconstruit l'URL en s'assurant que le slash final est au bon endroit (avant les paramètres)
    let pathPart = cleanEndpoint;
    let queryPart = '';
    const queryIndex = cleanEndpoint.indexOf('?');

    if (queryIndex !== -1) {
        pathPart = cleanEndpoint.substring(0, queryIndex);
        queryPart = cleanEndpoint.substring(queryIndex);
    }

    // On ajoute le slash final seulement si la partie "chemin" ne se termine pas déjà par un slash.
    if (!pathPart.endsWith('/')) {
        pathPart += '/';
    }

    const url = `/api/${pathPart}${queryPart}`;

    const response = await fetch(url, options);

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            // Fournit un message d'erreur plus clair pour les erreurs 404
            errorData = { detail: `Erreur ${response.status}: ${response.statusText}` };
        }
        // S'assure qu'on lance une erreur avec un message
        throw new Error(errorData.detail || errorData.error || `Erreur ${response.status}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}

async function handleLogout() {
    try {
        await apiCall('logout', 'POST');
    } catch (error) {
        console.error("Erreur lors de la déconnexion:", error);
    } finally {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('shoppingList');
        localStorage.removeItem('savedOptimizedList');
        window.location.reload();
    }
}

// --- GESTION DU DOM (RESTE DANS DOMCONTENTLOADED) ---

document.addEventListener('DOMContentLoaded', function() {
    // --- SÉLECTEURS D'ÉLÉMENTS DOM ---
    const navLoggedOutView = document.getElementById('nav-logged-out-view');
    const navLoggedInView = document.getElementById('nav-logged-in-view');
    const navUserStatus = document.getElementById('nav-user-status');
    const navLogoutBtn = document.getElementById('nav-logout-btn');

    // Éléments de la modale
    const authModal = document.getElementById('authModal');
    const authModalTitle = document.getElementById('authModalTitle');
    const loginFormModal = document.getElementById('login-form-modal');
    const registerFormModal = document.getElementById('register-form-modal');
    const authErrorModal = document.getElementById('auth-error-modal');
    const toggleToRegisterModal = document.getElementById('toggle-to-register-modal');
    const toggleToLoginModal = document.getElementById('toggle-to-login-modal');

    // --- FONCTIONS SPÉCIFIQUES À L'INSCRIPTION/CONNEXION ---

    async function handleRegister(e) {
        e.preventDefault();
        authErrorModal.textContent = '';
        authErrorModal.classList.add('d-none');

        const username = document.getElementById('register-username-modal').value;
        const email = document.getElementById('register-email-modal').value;
        const password = document.getElementById('register-password-modal').value;
        try {
            const data = await apiCall('register', 'POST', { username, email, password });
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);
            window.location.reload();
        } catch (error) {
            authErrorModal.textContent = error.message;
            authErrorModal.classList.remove('d-none');
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        authErrorModal.textContent = '';
        authErrorModal.classList.add('d-none');

        const username = document.getElementById('login-username-modal').value;
        const password = document.getElementById('login-password-modal').value;
        try {
            const data = await apiCall('login', 'POST', { username, password });
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);
            window.location.reload();
        } catch (error) {
            authErrorModal.textContent = error.message;
            authErrorModal.classList.remove('d-none');
        }
    }

    function updateAuthUI() {
        const token = localStorage.getItem('authToken');
        const username = localStorage.getItem('username');

        if (token && username) {
            // Gère la navbar pour un utilisateur connecté
            if (navLoggedInView) navLoggedInView.classList.remove('d-none');
            if (navLoggedOutView) navLoggedOutView.classList.add('d-none');
            if (navUserStatus) navUserStatus.textContent = `Connecté : ${username}`;

        } else {
            // Gère la navbar pour un utilisateur déconnecté
            if (navLoggedInView) navLoggedInView.classList.add('d-none');
            if (navLoggedOutView) navLoggedOutView.classList.remove('d-none');
            if (navUserStatus) navUserStatus.textContent = '';
        }
    }

    // --- ÉCOUTEURS D'ÉVÉNEMENTS ---
    if (loginFormModal) loginFormModal.addEventListener('submit', handleLogin);
    if (registerFormModal) registerFormModal.addEventListener('submit', handleRegister);
    if (navLogoutBtn) navLogoutBtn.addEventListener('click', handleLogout);

    if (toggleToRegisterModal) {
        toggleToRegisterModal.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginFormModal) loginFormModal.classList.add('d-none');
            if (registerFormModal) registerFormModal.classList.remove('d-none');
            if (authModalTitle) authModalTitle.textContent = "Inscription";
            if (toggleToRegisterModal) toggleToRegisterModal.classList.add('d-none');
            if (toggleToLoginModal) toggleToLoginModal.classList.remove('d-none');
            if (authErrorModal) authErrorModal.classList.add('d-none');
        });
    }

    if (toggleToLoginModal) {
        toggleToLoginModal.addEventListener('click', (e) => {
            e.preventDefault();
            if (registerFormModal) registerFormModal.classList.add('d-none');
            if (loginFormModal) loginFormModal.classList.remove('d-none');
            if (authModalTitle) authModalTitle.textContent = "Connexion";
            if (toggleToLoginModal) toggleToLoginModal.classList.add('d-none');
            if (toggleToRegisterModal) toggleToRegisterModal.classList.remove('d-none');
            if (authErrorModal) authErrorModal.classList.add('d-none');
        });
    }
    
    // Réinitialise l'état de la modale quand elle est fermée
    if (authModal) {
        authModal.addEventListener('hidden.bs.modal', function () {
            if (registerFormModal) registerFormModal.classList.add('d-none');
            if (loginFormModal) loginFormModal.classList.remove('d-none');
            if (authModalTitle) authModalTitle.textContent = "Connexion";
            if (toggleToLoginModal) toggleToLoginModal.classList.add('d-none');
            if (toggleToRegisterModal) toggleToRegisterModal.classList.remove('d-none');
            if (authErrorModal) authErrorModal.classList.add('d-none');
            if(loginFormModal) loginFormModal.reset();
            if(registerFormModal) registerFormModal.reset();
        });
    }

    // --- INITIALISATION ---
    updateAuthUI();
});