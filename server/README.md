# NEXUS AI API (facultatif)

Petite passerelle FastAPI **compatible OpenAI** : elle relaie le chat vers Ollama (ou tout serveur compatible OpenAI) en gardant la clé côté serveur. L'application fonctionne **sans** ce serveur ; il sert seulement si tu veux utiliser ton propre modèle.

## Lancer en local
1. Python 3.11+ et [Ollama](https://ollama.com) installés.
2. `ollama pull qwen2.5:3b`
3. Dans `server/` : `python -m venv .venv`, active-le, puis `pip install -r requirements.txt`.
4. Copie `.env.example` en `.env` (ne le commite jamais) et charge les variables dans ton terminal.
5. `uvicorn app.main:app --host 0.0.0.0 --port 8000`
6. Dans NEXUS → Réglages → Fournisseurs → **Mon serveur** : adresse `http://localhost:8000/v1`.

> Sans ce serveur, tu peux aussi brancher Ollama directement : lance `OLLAMA_ORIGINS=https://dianahilali3-prog.github.io ollama serve` et saisis `http://localhost:11434/v1`. Chrome autorise `localhost` depuis une page HTTPS ; Safari peut le bloquer.

## Points d'entrée
- `GET /health` — état du service.
- `GET /v1/models` — modèle configuré.
- `POST /v1/chat/completions` — format OpenAI, avec `"stream": true` (SSE).
- `POST /v1/chat` — ancien format `{"reply": "..."}`.

## Tests
`python -m unittest tests.test_api -v` (6 tests, aucun appel réseau réel).

## Sécurité avant toute mise en ligne
- HTTPS obligatoire, `NEXUS_ACCESS_TOKEN` défini, `CORS_ORIGINS` limité à l'adresse du site.
- Ne jamais exposer Ollama directement sur Internet ; ajouter un pare-feu et des limites de débit.
