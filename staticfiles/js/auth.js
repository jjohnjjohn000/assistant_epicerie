// Fichier: core/static/core/js/auth.js

document.addEventListener('DOMContentLoaded', function() {
    // --- SÉLECTEURS D'ÉLÉMENTS DOM ---
    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const userStatus = document.getElementById('user-status');
    const logoutBtn = document.getElementById('logout-btn');
    const authError = document.getElementById('auth-error');
    const toggleToRegister = document.getElementById('toggle-to-register');
    const toggleToLogin = document.getElementById('toggle-to-login');

    // Assurez-vous que les éléments existent avant d'ajouter des écouteurs
    if (!loginForm || !logoutBtn) {
        // Si les éléments d'auth ne sont pas sur la page, ne rien faire.
        return;
    }

    // --- FONCTIONS D'API ET D'AUTHENTIFICATION ---

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
        const response = await fetch(`/api/${endpoint}/`, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erreur ${response.status}`);
        }
        if (response.status === 204) {
            return null;
        }
        return response.json();
    }

    async function handleRegister(e) {
        e.preventDefault();
        authError.textContent = '';
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const data = await apiCall('register', 'POST', { username, email, password });
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);
            window.location.reload(); // Recharger la page pour charger les données de l'utilisateur
        } catch (error) {
            authError.textContent = error.message;
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        authError.textContent = '';
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        try {
            const data = await apiCall('login', 'POST', { username, password });
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);
            window.location.reload(); // Recharger la page pour charger les données de l'utilisateur
        } catch (error) {
            authError.textContent = error.message;
        }
    }

    async function handleLogout() {
        try {
            await apiCall('logout', 'POST');
        } catch (error) {
            console.error("Erreur lors de la déconnexion:", error);
        } finally {
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            // Nettoyer toutes les données locales pour éviter les fuites de données
            localStorage.removeItem('shoppingList');
            localStorage.removeItem('savedOptimizedList');
            window.location.href = '/'; // Rediriger vers l'accueil en mode déconnecté
        }
    }

    function updateAuthUI() {
        const token = localStorage.getItem('authToken');
        const username = localStorage.getItem('username');

        if (token && username) {
            loggedInView.classList.remove('hidden');
            loggedOutView.classList.add('hidden');
            userStatus.textContent = `Connecté : ${username}`;
            authError.textContent = '';
            // Le rechargement de page s'occupe de charger les bonnes données
        } else {
            loggedInView.classList.add('hidden');
            loggedOutView.classList.remove('hidden');
            userStatus.textContent = '';
        }
    }

    // --- ÉCOUTEURS D'ÉVÉNEMENTS ---
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);

    toggleToRegister.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        toggleToRegister.classList.add('hidden');
        registerForm.classList.remove('hidden');
        toggleToLogin.classList.remove('hidden');
        authError.textContent = '';
    });

    toggleToLogin.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        toggleToLogin.classList.add('hidden');
        loginForm.classList.remove('hidden');
        toggleToRegister.classList.remove('hidden');
        authError.textContent = '';
    });

    // --- INITIALISATION ---
    updateAuthUI();
});