# NEXUS AI — étude des moteurs open source

État de recherche : 12 novembre 2026. Vérifier à nouveau les licences avant chaque intégration ou distribution.

## Chat / raisonnement
- Qwen (Alibaba): https://github.com/QwenLM/Qwen — dépôt officiel Apache-2.0 pour le code du dépôt; les conditions des poids varient selon les familles et versions. Ne pas supposer qu'une licence de dépôt couvre tous les checkpoints.
- Ollama: https://github.com/ollama/ollama — runtime local pratique pour les modèles compatibles. Sur le HP d'entrée de gamme, choisir un modèle quantifié compact et mesurer le débit réel.
- llama.cpp: https://github.com/ggml-org/llama.cpp — runtime CPU/GPU pour modèles GGUF quantifiés.

## Images
- Qwen-Image: https://github.com/QwenLM/Qwen-Image — le README annonce Apache-2.0 pour ce dépôt et cette version. Les poids complets listés sur Hugging Face occupent environ 57.7 GB; ce n'est pas adapté au HP d'entrée de gamme ou à l'iPhone en exécution locale.
- Qwen-Image-2.1: https://github.com/QwenLM/Qwen-Image-2.1 — version plus récente, mais le dépôt annonce une Qwen Research License Agreement. Ne pas l'intégrer comme modèle commercialement libre sans analyse juridique dédiée.

## Vidéo
- Wan2.2: https://github.com/Wan-Video/Wan2.2 — dépôt officiel, code et poids annoncés sous Apache-2.0. Le modèle TI2V-5B nécessite environ 24 GB de VRAM selon les indications officielles; les modèles 14B demandent beaucoup plus. Impossible à faire tourner sur le matériel utilisateur actuel.
- ComfyUI: https://github.com/Comfy-Org/ComfyUI — moteur de workflows extensible. L'API officielle accepte un workflow via `POST /prompt`, expose l'état de file et l'historique, et propose WebSocket pour le suivi. Il faudra héberger ComfyUI sur une machine GPU distante.

## Décision d'architecture
1. L'iPhone reste un client web mobile/PWA : UI, prompts, historique et lecture des résultats.
2. Le backend NEXUS ne contient pas les poids lourds. Il orchestre les fournisseurs auto-hébergés et les files de tâches.
3. Chat local gratuit via Ollama uniquement si une machine compatible est disponible et joignable de manière sécurisée.
4. Images/vidéos via ComfyUI + modèles open source sur GPU dédié. Les offres cloud gratuites ne sont pas une capacité illimitée garantie.
5. Avant toute intégration, vérifier séparément : licence du code, licence des poids, restrictions d'usage, taille des poids, VRAM minimale, dépendances et empreinte disque.

## Sources primaires
- ComfyUI routes: https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/comms_routes.mdx
- ComfyUI OpenAPI: https://github.com/Comfy-Org/ComfyUI/blob/master/openapi.yaml
- Qwen Image README: https://github.com/QwenLM/Qwen-Image
- Qwen Image 2.1 README: https://github.com/QwenLM/Qwen-Image-2.1
- Wan2.2 README: https://github.com/Wan-Video/Wan2.2
