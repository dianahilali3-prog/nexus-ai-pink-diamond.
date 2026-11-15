# NEXUS AI — Pink Diamond Edition

Assistant IA créatif, **gratuit, open source et privé**, pensé d'abord pour le téléphone.
Site : **https://dianahilali3-prog.github.io/NEXUSAI/**

## Ce que fait l'application
- **Chat** en flux continu, Markdown (listes, tableaux, code), copier / régénérer / arrêter, plusieurs conversations sauvegardées, mémoire de la conversation.
- **Plusieurs fournisseurs gratuits avec bascule automatique** : Pollinations (sans clé), OpenRouter (modèles `:free`), Groq, Pollinations avec clé, ton serveur (Ollama, LM Studio, llama.cpp, vLLM…), et une **IA qui tourne dans le navigateur** (Transformers.js, WebGPU/WASM, hors ligne).
- **Voix dans les deux sens** : dictée (navigateur ou **Whisper** open source sur l'appareil), lecture à voix haute (navigateur ou **Piper** open source), choix langue/voix/vitesse, et **conversation vocale mains libres**.
- **Recherche web** (Wikipédia, ou ton instance SearXNG) avec sources citées ; **lecture des liens** collés (Jina Reader).
- **Documents** : PDF, Word (.docx), TXT, Markdown, CSV, HTML → réponses basées sur le document (sélection des passages pertinents sur l'appareil).
- **Images** : Pollinations (sans clé) avec secours FLUX.1 schnell (Hugging Face), prompt amélioré automatiquement, styles, formats, téléchargement, partage. **Description d'une image** importée (modèle local).
- **Rapport / projet → images & vidéo** : storyboard généré par l'IA, une image par scène, puis **montage vidéo dans le navigateur** (zoom lent, fondus, sous-titres, voix off Piper facultative).
- **Vidéo IA (bêta)** : LTX-Video sur un espace Hugging Face gratuit (quota GPU quotidien) ou Pollinations avec clé.
- **Agents** (NEXUS, Muse, Orion, Pixel, Atlas, Scribe, Dev) + création d'agents personnels.
- **Apprentissage local** : mémoire (souvenirs) et « leçons » tirées des 👎, visibles et supprimables.
- **PWA** installable, interface et galerie disponibles hors ligne. Page **Confidentialité** détaillant chaque service contacté.

## Limites honnêtes
Aucun service gratuit n'est illimité. Voir [`docs/SERVICES.md`](docs/SERVICES.md) pour les vérifications réelles (CORS, quotas, conditions d'utilisation) et [`docs/ENGINE_RESEARCH.md`](docs/ENGINE_RESEARCH.md).

## Développement
Prérequis : Node.js 20+.
```bash
npm install
npm run check      # TypeScript
npm run build      # compile dans dist/
npm run preview    # aperçu local
```
Pour GitHub Pages, le workflow `.github/workflows/deploy.yml` compile avec `VITE_BASE=/<nom-du-dépôt>/` et publie `dist/`. Réglage requis : Settings → Pages → Source : **GitHub Actions**.

## Structure
```
src/            interface React + services (lib/) + worker IA locale (workers/)
public/         icônes de l'application
server/         passerelle FastAPI facultative (compatible OpenAI)
docs/           recherches et vérifications des services
.github/        déploiement GitHub Pages
```

## Sécurité
Aucune clé n'est stockée dans le dépôt ni dans le code du site. Les clés facultatives (OpenRouter, Groq, Pollinations, Hugging Face) sont saisies dans les Réglages, restent dans le navigateur et ne sont jamais exportées.
