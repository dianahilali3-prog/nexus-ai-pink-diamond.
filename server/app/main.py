"""NEXUS AI API — passerelle optionnelle compatible OpenAI.

Elle relaie les requêtes de chat vers un fournisseur compatible OpenAI (Ollama par défaut)
en gardant la clé côté serveur. L'application web s'y connecte via
Réglages → Fournisseurs → « Mon serveur » avec l'adresse  https://ton-serveur/v1
"""
from __future__ import annotations

import os
from typing import Literal, Union

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

APP_NAME = "NEXUS AI API"
VERSION = "1.0.0"
PROVIDER_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1").rstrip("/")
PROVIDER_API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL_NAME = os.getenv("NEXUS_MODEL", "qwen2.5:3b")
ACCESS_TOKEN = os.getenv("NEXUS_ACCESS_TOKEN", "")  # facultatif : protège l'API
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]

app = FastAPI(title=APP_NAME, version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


class TextPart(BaseModel):
    type: Literal["text"]
    text: str = Field(max_length=200_000)


class ImagePart(BaseModel):
    type: Literal["image_url"]
    image_url: dict


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: Union[str, list[Union[TextPart, ImagePart]]]

    def is_empty(self) -> bool:
        return isinstance(self.content, str) and not self.content.strip()


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=80)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    stream: bool = False
    model: str | None = None


def _check_token(request: Request) -> None:
    if not ACCESS_TOKEN:
        return
    if request.headers.get("authorization", "") != f"Bearer {ACCESS_TOKEN}":
        raise HTTPException(status_code=401, detail="Jeton d'accès NEXUS invalide.")


def _upstream_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if PROVIDER_API_KEY:
        headers["Authorization"] = f"Bearer {PROVIDER_API_KEY}"
    return headers


def _body(payload: ChatRequest, stream: bool) -> dict:
    if any(m.is_empty() for m in payload.messages if m.role == "user"):
        raise HTTPException(status_code=422, detail="Message vide.")
    body = {
        "model": MODEL_NAME,
        "messages": [m.model_dump() for m in payload.messages],
        "temperature": payload.temperature,
        "stream": stream,
    }
    if payload.max_tokens:
        body["max_tokens"] = payload.max_tokens
    return body


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": VERSION,
        "chat_configured": bool(PROVIDER_BASE_URL and MODEL_NAME),
        "model": MODEL_NAME,
        "image_engine": "not_configured",
        "video_engine": "not_configured",
    }


@app.get("/v1/models")
async def models():
    return {"object": "list", "data": [{"id": MODEL_NAME, "object": "model", "owned_by": "nexus"}]}


async def _complete(body: dict):
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=8.0)) as client:
            response = await client.post(f"{PROVIDER_BASE_URL}/chat/completions", headers=_upstream_headers(), json=body)
            response.raise_for_status()
            return response.json()
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=503, detail="Fournisseur IA injoignable. Vérifie Ollama ou l'adresse configurée.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Le fournisseur IA a répondu {exc.response.status_code}.") from exc


@app.post("/v1/chat/completions")
async def chat_completions(payload: ChatRequest, request: Request):
    """Point d'entrée compatible OpenAI, avec diffusion en continu (SSE)."""
    _check_token(request)
    body = _body(payload, payload.stream)
    if not payload.stream:
        return await _complete(body)

    async def relay():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=8.0)) as client:
                async with client.stream("POST", f"{PROVIDER_BASE_URL}/chat/completions", headers=_upstream_headers(), json=body) as resp:
                    if resp.status_code >= 400:
                        yield f'data: {{"error": {{"message": "Fournisseur IA : erreur {resp.status_code}"}}}}\n\n'.encode()
                        return
                    async for chunk in resp.aiter_raw():
                        yield chunk
        except httpx.ConnectError:
            yield b'data: {"error": {"message": "Fournisseur IA injoignable (Ollama est-il lance ?)"}}\n\n'

    return StreamingResponse(relay(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/v1/chat")
async def chat(payload: ChatRequest, request: Request):
    """Ancien format simple ({"reply": "..."}), conservé pour compatibilité."""
    _check_token(request)
    data = await _complete(_body(payload, False))
    try:
        reply = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Réponse invalide du fournisseur IA.") from exc
    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(status_code=502, detail="Réponse vide du fournisseur IA.")
    return {"reply": reply, "model": data.get("model", MODEL_NAME)}
