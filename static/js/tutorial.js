/* static/js/tutorial.js */

class TutorialEngine {
    constructor() {
        this.cursor = null;
        this.tooltip = null;
        this.overlay = null;
        this.isPlaying = false;
        this.initElements();
    }

    initElements() {
        // ... (Code de création des éléments identique à avant) ...
        // Créer le curseur
        if (!document.getElementById('tutorial-cursor')) {
            this.cursor = document.createElement('div');
            this.cursor.id = 'tutorial-cursor';
            document.body.appendChild(this.cursor);
        } else {
            this.cursor = document.getElementById('tutorial-cursor');
        }

        // Créer la bulle d'info
        if (!document.getElementById('tutorial-tooltip')) {
            this.tooltip = document.createElement('div');
            this.tooltip.id = 'tutorial-tooltip';
            document.body.appendChild(this.tooltip);
        } else {
            this.tooltip = document.getElementById('tutorial-tooltip');
        }

        // Créer l'overlay
        if (!document.getElementById('tutorial-overlay')) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'tutorial-overlay';
            this.overlay.onclick = () => this.stop();
            document.body.appendChild(this.overlay);
        } else {
            this.overlay = document.getElementById('tutorial-overlay');
        }
    }

    async run(steps) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.cursor.style.display = 'block';
        this.overlay.style.display = 'block';
        
        // Position de départ centrée
        this.cursor.style.left = '50%';
        this.cursor.style.top = '50%';
        // Reset tooltip
        this.tooltip.style.opacity = '0';

        for (const step of steps) {
            if (!this.isPlaying) break;
            try {
                await this.performStep(step);
            } catch (e) {
                console.warn("Erreur étape tuto:", e);
                break;
            }
        }

        this.stop();
    }

    stop() {
        this.isPlaying = false;
        this.cursor.style.display = 'none';
        this.tooltip.style.opacity = '0';
        this.overlay.style.display = 'none';
        
        // Nettoyage focus
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
    }

    async performStep(step) {
        return new Promise(async (resolve, reject) => {
            const el = document.querySelector(step.selector);
            if (!el) return reject("Element not found: " + step.selector);

            // --- CORRECTION MAJEURE ICI ---
            // 1. Défilement intelligent : on cherche le parent scrollable le plus proche
            // Cela permet de scroller DANS le widget, pas juste la page
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            
            await this.wait(600); // Attendre la fin du scroll

            // 2. Calculer la position absolue par rapport à la vue
            const rect = el.getBoundingClientRect();
            
            // Vérification si l'élément est visible (hors champ viewport)
            if (rect.top < 0 || rect.top > window.innerHeight || rect.left < 0 || rect.left > window.innerWidth) {
                 // Fallback brutal si scrollIntoView smooth a échoué
                 el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
                 await this.wait(100);
            }

            // Recalcul après scroll éventuel
            const finalRect = el.getBoundingClientRect();
            const targetX = finalRect.left + (finalRect.width / 2);
            const targetY = finalRect.top + (finalRect.height / 2);

            // 3. Bouger le curseur
            this.cursor.style.left = `${targetX}px`;
            this.cursor.style.top = `${targetY}px`;

            // 4. Afficher le tooltip
            if (step.text) {
                this.tooltip.textContent = step.text;
                // Positionnement dynamique du tooltip pour qu'il ne sorte pas de l'écran
                let tooltipTop = targetY - 60;
                let tooltipLeft = targetX;
                
                // Si trop haut, on met en dessous
                if (tooltipTop < 20) tooltipTop = targetY + 40;
                
                this.tooltip.style.left = `${tooltipLeft}px`;
                this.tooltip.style.top = `${tooltipTop}px`;
                this.tooltip.style.opacity = '1';
            } else {
                this.tooltip.style.opacity = '0';
            }

            await this.wait(800); // Temps de trajet du curseur

            // 5. Actions
            if (step.action === 'type' && step.value) {
                el.classList.add('tutorial-focus');
                const originalValue = el.value;
                el.value = "";
                for (let char of step.value) {
                    el.value += char;
                    await this.wait(100);
                }
                await this.wait(600);
                el.value = originalValue; 
                el.classList.remove('tutorial-focus');
                // Petit hack pour reset le visuel si c'était un input number
                el.dispatchEvent(new Event('input')); 
            }

            if (step.action === 'click') {
                this.cursor.classList.add('clicking');
                await this.wait(300);
                this.cursor.classList.remove('clicking');
                if (step.realClick) el.click();
            }

            await this.wait(step.waitAfter || 1000);
            resolve();
        });
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.Tutorial = new TutorialEngine();