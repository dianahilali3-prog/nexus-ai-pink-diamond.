"""NEXUS AI API: minimal OpenAI-compatible chat gateway.
No provider key is embedded in the mobile client. Configure secrets server-side.
"""
from __future__ import annotations
import os
from typing import Literal
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "NEXUS AI API"
PROVIDER_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://127.0.0.1:11434/v1").rstrip("/")
PROVIDER_API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL_NAME = os.getenv("NEXUS_MODEL", "qwen2.5:3b")
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if x.strip()]

app = FastAPI(title=APP_NAME, version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])

class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=16000)

class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=40)
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=1200, ge=1, le=4096)

@app.get("/health")
async def health():
    return {"status": "ok", "service": APP_NAME, "version": "0.2.0", "chat_configured": bool(PROVIDER_BASE_URL and MODEL_NAME), "model": MODEL_NAME, "image_engine": "not_configured", "video_engine": "not_configured"}

@app.post("/v1/chat")
async def chat(payload: ChatRequest):
    headers = {"Content-Type": "application/json"}
    if PROVIDER_API_KEY:
        headers["Authorization"] = f"Bearer {PROVIDER_API_KEY}"
    body = {"model": MODEL_NAME, "messages": [m.model_dump() for m in payload.messages], "temperature": payload.temperature, "max_tokens": payload.max_tokens, "stream": False}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=8.0)) as client:
            response = await client.post(f"{PROVIDER_BASE_URL}/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
        reply = data["choices"][0]["message"]["content"]
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError("Provider returned an empty response")
        return {"reply": reply, "model": data.get("model", MODEL_NAME)}
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=503, detail="AI provider unavailable. Check Ollama or the configured OpenAI-compatible endpoint.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider returned HTTP {exc.response.status_code}.") from exc
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="AI provider returned an invalid response.") from exc
