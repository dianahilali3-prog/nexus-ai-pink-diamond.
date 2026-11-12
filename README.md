# NEXUS AI API v0.2.0

This is a real chat gateway for an OpenAI-compatible provider. It does not fake image or video generation.

## Local development

1. Install Python 3.11+.
2. Start Ollama and pull a model compatible with your hardware, e.g. `ollama pull qwen2.5:3b` (model availability and performance depend on RAM/CPU).
3. `python -m venv .venv` then activate it.
4. `pip install -r requirements.txt`.
5. Copy `.env.example` to `.env` and adjust settings. Load env vars in your shell or use `python-dotenv` in your deployment entrypoint.
6. From `server/`: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

## Endpoints
- `GET /health`: service and engine readiness metadata.
- `POST /v1/chat`: OpenAI-compatible chat completion proxy.

Example request body:
```json
{"messages":[{"role":"user","content":"Bonjour !"}]}
```

## iPhone connectivity
The PWA needs a publicly reachable HTTPS API URL. A localhost Ollama URL on your HP is not reachable from the iPhone outside the same network and is not a public cloud service. Do not expose Ollama directly to the internet. Put this API behind HTTPS, authentication, rate limiting and a firewall before deployment.

## Image/video status
Not connected in this release. ComfyUI requires a separate GPU-capable host and explicit workflow JSON. This API reports those engines as `not_configured` rather than claiming jobs were generated.

## Security
- Keep `OPENAI_API_KEY` on the server only.
- Restrict `CORS_ORIGINS` to the deployed PWA origin.
- Add authentication and per-user rate limits before public deployment.
- Use private object storage for generated files; never trust uploaded filenames or MIME types.
