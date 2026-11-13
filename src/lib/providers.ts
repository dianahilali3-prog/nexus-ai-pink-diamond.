import { getSettings, type ProviderId, type Settings } from './settings';
import type { Role } from './types';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface WireMessage {
  role: Role;
  content: string | ContentPart[];
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  short: string;
  needsKey: boolean;
  keyField?: keyof Settings['keys'];
  description: string;
  howTo?: string;
  keyUrl?: string;
  limits: string;
  host: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  pollinations: {
    id: 'pollinations',
    name: 'Pollinations (gratuit, sans clé)',
    short: 'Pollinations',
    needsKey: false,
    description: 'Service gratuit sans inscription. Modèle actuel sans clé : GPT-OSS 20B (open source).',
    limits: 'Sans clé : un seul modèle, file d’attente partagée, cadence limitée (erreur 429 possible). Service « tel quel », sans garantie.',
    host: 'text.pollinations.ai'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (modèles :free)',
    short: 'OpenRouter',
    needsKey: true,
    keyField: 'openrouter',
    description: 'Accès à des modèles ouverts gratuits (Gemma, Nemotron, etc.). Certains comprennent les images.',
    howTo: 'Crée un compte gratuit sur openrouter.ai → menu « Keys » → « Create Key ». Copie la clé (sk-or-…) ici.',
    keyUrl: 'https://openrouter.ai/keys',
    limits: 'Modèles « :free » : environ 20 requêtes/minute et un quota quotidien limité (plus élevé si le compte a déjà été crédité).',
    host: 'openrouter.ai'
  },
  groq: {
    id: 'groq',
    name: 'Groq (très rapide)',
    short: 'Groq',
    needsKey: true,
    keyField: 'groq',
    description: 'Modèles ouverts (Llama, Qwen, GPT-OSS…) servis très vite. Offre gratuite avec limites.',
    howTo: 'Crée un compte gratuit sur console.groq.com → « API Keys » → « Create API Key ». Copie la clé (gsk_…) ici.',
    keyUrl: 'https://console.groq.com/keys',
    limits: 'Offre gratuite : limites par minute et par jour selon le modèle (affichées dans la console Groq).',
    host: 'api.groq.com'
  },
  'pollinations-key': {
    id: 'pollinations-key',
    name: 'Pollinations avec clé (plus de modèles)',
    short: 'Pollinations+',
    needsKey: true,
    keyField: 'pollinations',
    description: 'Des centaines de modèles. Consomme du « Pollen » : gratuit via les quêtes/bonus, sinon payant.',
    howTo: 'Connecte-toi sur enter.pollinations.ai → « Keys » → crée une clé secrète (sk_…) avec un plafond de dépense bas. Colle-la ici.',
    keyUrl: 'https://enter.pollinations.ai/keys',
    limits: 'Chaque requête dépense du Pollen (crédit). Fixe un plafond sur la clé.',
    host: 'gen.pollinations.ai'
  },
  custom: {
    id: 'custom',
    name: 'Mon serveur (Ollama, LM Studio, llama.cpp, vLLM…)',
    short: 'Mon serveur',
    needsKey: false,
    keyField: 'custom',
    description: 'Tout serveur compatible OpenAI. Exemple Ollama : http://localhost:11434/v1',
    howTo: 'Ollama : lance `OLLAMA_ORIGINS=* ollama serve`, puis `ollama pull qwen2.5:3b`. Depuis un téléphone, il faut une adresse HTTPS joignable.',
    limits: 'Dépend de ta machine. Gratuit, privé, mais lent sur un petit ordinateur.',
    host: 'ton serveur'
  },
  local: {
    id: 'local',
    name: 'IA dans le navigateur (hors ligne)',
    short: 'Local',
    needsKey: false,
    description: 'Un petit modèle open source téléchargé une fois puis exécuté sur ton appareil (WebGPU si disponible).',
    limits: 'Téléchargement de 300 Mo à 1 Go. Réponses plus simples et plus lentes, surtout sur téléphone.',
    host: 'huggingface.co (téléchargement uniquement)'
  }
};

export const LOCAL_MODELS = [
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B (≈ 500 Mo, multilingue)' },
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'SmolLM2 360M (≈ 270 Mo, surtout anglais)' },
  { id: 'onnx-community/Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B (≈ 1,2 Go, meilleur, WebGPU conseillé)' }
];

export class ProviderError extends Error {
  constructor(message: string, public status?: number, public retryable = false) {
    super(message);
  }
}

function endpoint(id: ProviderId, s: Settings): string {
  switch (id) {
    case 'pollinations': return 'https://text.pollinations.ai/openai';
    case 'pollinations-key': return 'https://gen.pollinations.ai/v1/chat/completions';
    case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
    case 'groq': return 'https://api.groq.com/openai/v1/chat/completions';
    case 'custom': return `${s.customBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    default: return '';
  }
}

export function providerReady(id: ProviderId, s = getSettings()): boolean {
  if (!s.enabled[id]) return false;
  const info = PROVIDERS[id];
  if (info.needsKey && info.keyField && !s.keys[info.keyField].trim()) return false;
  if (id === 'custom' && !/^https?:\/\//.test(s.customBaseUrl.trim())) return false;
  return true;
}

export function activeProviders(s = getSettings()): ProviderId[] {
  return s.providerOrder.filter(p => providerReady(p, s));
}

export function supportsVision(id: ProviderId, model: string) {
  if (id === 'pollinations' || id === 'local') return false;
  return /vl|vision|gemma-?[34]|gemini|gpt-4o|gpt-4\.1|gpt-5|llava|pixtral|llama-4|omni|claude|qwen.*vl|maverick|scout/i.test(model);
}

function headers(id: ProviderId, s: Settings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = PROVIDERS[id].keyField ? s.keys[PROVIDERS[id].keyField!].trim() : '';
  if (key) h.Authorization = `Bearer ${key}`;
  if (id === 'openrouter') h['X-Title'] = 'NEXUS AI';
  return h;
}

export function friendlyHttpError(status: number, body: string, who: string): ProviderError {
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message || j?.message || j?.detail || (typeof j?.error === 'string' ? j.error : '');
  } catch {
    detail = body.slice(0, 160);
  }
  const msg =
    status === 401 || status === 403 ? `${who} : clé absente, invalide ou sans permission.` :
    status === 402 ? `${who} : crédit insuffisant pour ce modèle.` :
    status === 404 ? `${who} : modèle ou adresse introuvable.` :
    status === 413 ? `${who} : message trop long.` :
    status === 429 ? `${who} : trop de demandes pour le moment (limite gratuite atteinte).` :
    status >= 500 ? `${who} : service momentanément indisponible (${status}).` :
    `${who} : erreur ${status}.`;
  return new ProviderError(detail && status !== 429 ? `${msg} ${String(detail).slice(0, 160)}` : msg, status, status === 429 || status >= 500);
}

/** Lit un flux SSE compatible OpenAI. */
async function readSSE(
  res: Response,
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  idleMs: number,
  abort: () => void
) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let timer = window.setTimeout(abort, idleMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      window.clearTimeout(timer);
      timer = window.setTimeout(abort, idleMs);
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let j: any;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new ProviderError(typeof j.error === 'string' ? j.error : j.error.message || 'Erreur du service');
        const d = j.choices?.[0]?.delta ?? j.choices?.[0]?.message ?? {};
        const r = d.reasoning ?? d.reasoning_content;
        if (typeof r === 'string' && r) onReasoning(r);
        if (typeof d.content === 'string' && d.content) {
          full += d.content;
          onToken(d.content);
        }
      }
    }
  } finally {
    window.clearTimeout(timer);
  }
  return full;
}

export interface StreamOptions {
  signal?: AbortSignal;
  temperature?: number;
  only?: ProviderId; // forcer un fournisseur
  maxTokens?: number;
  /** Effort de réflexion des modèles « à raisonnement » (Pollinations / GPT-OSS). */
  reasoning?: 'low' | 'medium' | 'high';
}
export interface StreamCallbacks {
  onToken: (t: string) => void;
  onReasoning?: (t: string) => void;
  onProvider?: (id: ProviderId, model: string) => void;
  onNote?: (text: string) => void;
}

// Le service gratuit Pollinations refuse les requêtes simultanées d'un même visiteur
// (le refus arrive sans en-têtes CORS et ressemble à une coupure réseau) :
// on envoie donc une seule requête à la fois, avec quelques nouvelles tentatives.
const queues = new Map<ProviderId, Promise<unknown>>();
function serialized<T>(id: ProviderId, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(id, next.catch(() => undefined));
  return next;
}
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Arrêté', 'AbortError')); });
  });

async function callRemoteWithRetry(id: ProviderId, messages: WireMessage[], opts: StreamOptions, cb: StreamCallbacks): Promise<string> {
  const run = async () => {
    const delays = id === 'pollinations' ? [2500, 6000] : [2000];
    for (let attempt = 0; ; attempt++) {
      let started = false;
      try {
        return await callRemote(id, messages, opts, { ...cb, onToken: t => { started = true; cb.onToken(t); } });
      } catch (e) {
        const retryable = e instanceof ProviderError && e.retryable && !started && !opts.signal?.aborted;
        if (!retryable || attempt >= delays.length) throw e;
        cb.onNote?.(`${PROVIDERS[id].short} occupé, nouvel essai dans ${Math.round(delays[attempt] / 1000)} s…`);
        await wait(delays[attempt], opts.signal);
      }
    }
  };
  return id === 'pollinations' ? serialized(id, run) : run();
}

async function callRemote(id: ProviderId, messages: WireMessage[], opts: StreamOptions, cb: StreamCallbacks): Promise<string> {
  const s = getSettings();
  const model = s.models[id];
  const local = new AbortController();
  const onAbort = () => local.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const connectTimer = window.setTimeout(() => local.abort(), 60_000);
  const body: Record<string, unknown> = {
    model,
    messages: supportsVision(id, model) ? messages : messages.map(m => ({ role: m.role, content: flatten(m.content) })),
    stream: true,
    temperature: opts.temperature ?? s.temperature
  };
  // Les modèles « à raisonnement » comptent leur réflexion dans max_tokens : marge large.
  if (opts.maxTokens && id !== 'pollinations') body.max_tokens = Math.max(opts.maxTokens, 1024);
  if (id === 'pollinations') {
    body.private = true;
    body.referrer = 'nexus-ai';
    // Sans cela, le modèle peut épuiser sa limite en réfléchissant et ne rien répondre.
    body.reasoning_effort = opts.reasoning ?? 'medium';
  }
  try {
    let res: Response;
    try {
      res = await fetch(endpoint(id, s), { method: 'POST', headers: headers(id, s), body: JSON.stringify(body), signal: local.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      if (local.signal.aborted) throw new ProviderError(`${PROVIDERS[id].short} : délai dépassé.`);
      throw new ProviderError(
        id === 'custom'
          ? 'Mon serveur : connexion impossible. Vérifie l’adresse, que le serveur tourne, et qu’il autorise ce site (CORS / OLLAMA_ORIGINS).'
          : `${PROVIDERS[id].short} : connexion impossible (service saturé ou réseau coupé).`,
        undefined,
        id !== 'custom'
      );
    }
    window.clearTimeout(connectTimer);
    if (!res.ok) throw friendlyHttpError(res.status, await res.text().catch(() => ''), PROVIDERS[id].short);
    cb.onProvider?.(id, model);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      // Certains serveurs ignorent « stream » : on gère la réponse complète.
      const j = await res.json();
      const text: string = j.choices?.[0]?.message?.content ?? '';
      if (!text) throw new ProviderError(`${PROVIDERS[id].short} : réponse vide.`);
      cb.onToken(text);
      return text;
    }
    const text = await readSSE(res, cb.onToken, t => cb.onReasoning?.(t), 90_000, () => local.abort());
    if (!text.trim()) throw new ProviderError(`${PROVIDERS[id].short} : réponse vide.`, undefined, true);
    return text;
  } finally {
    window.clearTimeout(connectTimer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export function flatten(c: string | ContentPart[]): string {
  return typeof c === 'string' ? c : c.map(p => (p.type === 'text' ? p.text : '')).join('\n');
}

/**
 * Envoie la conversation au premier fournisseur disponible ;
 * bascule automatiquement sur le suivant en cas d’échec avant le premier mot.
 */
export async function streamChat(messages: WireMessage[], opts: StreamOptions, cb: StreamCallbacks) {
  const s = getSettings();
  const order = opts.only ? [opts.only] : activeProviders(s);
  if (!order.length) throw new ProviderError('Aucun fournisseur de chat actif. Active-en un dans Réglages → Fournisseurs.');
  const errors: string[] = [];
  for (const id of order) {
    let started = false;
    const wrapped: StreamCallbacks = { ...cb, onToken: t => { started = true; cb.onToken(t); } };
    try {
      let text: string;
      if (id === 'local') {
        const { localChat } = await import('./localllm');
        cb.onProvider?.(id, s.localModel);
        text = await localChat(messages.map(m => ({ role: m.role, content: flatten(m.content) })), wrapped.onToken, opts.signal, cb.onNote);
      } else {
        text = await callRemoteWithRetry(id, messages, opts, wrapped);
      }
      return { provider: id, model: id === 'local' ? s.localModel : s.models[id], text, errors };
    } catch (e) {
      if (opts.signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      if (started) throw new ProviderError(`${msg} (réponse interrompue)`);
      if (order.indexOf(id) < order.length - 1) cb.onNote?.(`${msg} → bascule sur ${PROVIDERS[order[order.indexOf(id) + 1]].short}.`);
    }
  }
  throw new ProviderError(errors.join('\n'));
}

/** Petite requête non diffusée (titres, amélioration de prompt, mémoire…). */
export async function quickChat(messages: WireMessage[], opts: StreamOptions = {}) {
  let out = '';
  const r = await streamChat(messages, { reasoning: 'low', ...opts }, { onToken: t => { out += t; } });
  return { ...r, text: out.trim() };
}

export async function listModels(id: ProviderId): Promise<string[]> {
  const s = getSettings();
  const get = async (url: string, auth?: string) => {
    const res = await fetch(url, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
    if (!res.ok) throw friendlyHttpError(res.status, await res.text(), PROVIDERS[id].short);
    return res.json();
  };
  switch (id) {
    case 'pollinations': {
      const j = await get('https://text.pollinations.ai/models');
      return (j as { name: string }[]).map(m => m.name);
    }
    case 'pollinations-key': {
      const j = await get('https://gen.pollinations.ai/text/models');
      const arr = Array.isArray(j) ? j : j.data ?? [];
      return arr.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean);
    }
    case 'openrouter': {
      const j = await get('https://openrouter.ai/api/v1/models');
      return (j.data as { id: string }[]).map(m => m.id).filter(m => m.endsWith(':free'));
    }
    case 'groq': {
      const j = await get('https://api.groq.com/openai/v1/models', s.keys.groq.trim());
      return (j.data as { id: string }[]).map(m => m.id).filter(m => !/whisper|tts|guard/i.test(m)).sort();
    }
    case 'custom': {
      const j = await get(`${s.customBaseUrl.replace(/\/+$/, '')}/models`, s.keys.custom.trim() || undefined);
      return (j.data as { id: string }[]).map(m => m.id);
    }
    case 'local':
      return LOCAL_MODELS.map(m => m.id);
  }
}
