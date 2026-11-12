# NEXUS AI — Pink Diamond Edition

Version 0.2.0 · application mobile-first pensée pour Safari sur iPhone.

## Ce qui fonctionne dans cette version
- Navigation entre les espaces Accueil, Assistant, Image Studio, Video Studio, Galerie et Agents.
- Interface responsive avec animations et prise en compte de `prefers-reduced-motion`.
- Sauvegarde locale des conversations et des prompts dans le navigateur.
- Export JSON des conversations et prompts.
- Préparation de lots de prompts image/vidéo (cela ne lance pas encore les moteurs de génération).
- Configuration d'une URL d'API depuis les réglages.
- Chat réel via le backend Python lorsque celui-ci est déployé et relié à un fournisseur compatible OpenAI (Ollama par défaut).
- PWA installable après déploiement HTTPS.

## Ce qui n'est PAS encore disponible
- Génération réelle d'images et de vidéos : moteurs GPU non connectés.
- Comptes utilisateurs et synchronisation cloud entre appareils.
- Agents autonomes avec exécution d'outils.
- Authentification du backend : à ajouter avant toute exposition publique.
- Service hébergé et URL publique : non fournis par ce dépôt.

Aucune génération n'est simulée comme réussie. Le statut `/health` annonce explicitement les moteurs image et vidéo non configurés.

## Frontend
Prérequis : Node.js 20+.

```bash
npm install
npm run check
npm run build
npm run dev
```

Sur iPhone : déployer `dist` sur un hébergement HTTPS, ouvrir le site dans Safari, puis Partager → Sur l'écran d'accueil.

## Backend chat
Voir [`server/README.md`](server/README.md). Il fournit un proxy FastAPI vers un endpoint compatible OpenAI. Pour un usage à 0 €, Ollama peut servir un modèle local sur une machine compatible, mais le HP bas de gamme peut être lent ou manquer de mémoire. L'iPhone est le client, pas le serveur de génération lourd.

## Coûts et limites
Le code est gratuit et peut être auto-hébergé. Cela ne rend pas le calcul distant gratuit ou illimité : les services cloud gratuits ont des quotas, et l'auto-hébergement consomme matériel, électricité, réseau et stockage. Aucun service payant n'est requis par le code, mais une API publique fiable nécessite une infrastructure disponible.

## Sécurité avant production
- Déployer uniquement derrière HTTPS.
- Ajouter authentification, quotas anti-abus et limites de taille.
- Garder les clés fournisseur uniquement côté serveur.
- Restreindre CORS à l'origine exacte de la PWA.
- Ne pas exposer directement Ollama ou ComfyUI à Internet.
- Vérifier les licences des poids des modèles et des workflows, séparément des licences de code.

## Étude des moteurs
Voir [`docs/ENGINE_RESEARCH.md`](docs/ENGINE_RESEARCH.md) pour les dépôts officiels, licences, tailles de modèles, besoins GPU et décision d'intégration. Exemple important : Wan2.2 TI2V-5B annonce environ 24 Go de VRAM pour la génération 720p; ce n'est pas exploitable sur l'iPhone ni sur le HP d'entrée de gamme.
