import { getSettings } from './settings';

type Msg = { id: number; type: 'progress' | 'token' | 'done' | 'error' | 'status'; text?: string; file?: string; progress?: number; loaded?: number; total?: number };
type Handler = (m: Msg) => void;

let worker: Worker | null = null;
let seq = 0;
const handlers = new Map<number, Handler>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Msg>) => handlers.get(e.data.id)?.(e.data);
    worker.onerror = e => {
      const err = e.message || 'Le moteur local a planté (mémoire insuffisante ?).';
      handlers.forEach(h => h({ id: -1, type: 'error', text: err }));
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export type ProgressFn = (info: { file?: string; progress: number; status?: string }) => void;

function run(payload: Record<string, unknown>, onToken?: (t: string) => void, onProgress?: ProgressFn, signal?: AbortSignal, transfer: Transferable[] = []) {
  return new Promise<string>((resolve, reject) => {
    const id = ++seq;
    const w = getWorker();
    const cleanup = () => { handlers.delete(id); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { w.postMessage({ id, type: 'stop' }); };
    signal?.addEventListener('abort', onAbort);
    handlers.set(id, m => {
      if (m.type === 'token' && m.text) onToken?.(m.text);
      else if (m.type === 'progress') onProgress?.({ file: m.file, progress: m.progress ?? 0 });
      else if (m.type === 'status') onProgress?.({ progress: 100, status: m.text });
      else if (m.type === 'done') { cleanup(); resolve(m.text ?? ''); }
      else if (m.type === 'error') { cleanup(); reject(new Error(friendly(m.text ?? ''))); }
    });
    w.postMessage({ id, ...payload }, transfer);
  });
}

function friendly(raw: string) {
  if (/memory|allocation|OOM/i.test(raw)) return `Mémoire insuffisante pour ce modèle local. Choisis un modèle plus petit. (${raw.slice(0, 80)})`;
  if (/fetch|network|Failed to load/i.test(raw)) return `Téléchargement du modèle impossible (connexion ?). (${raw.slice(0, 80)})`;
  return `Moteur local : ${raw.slice(0, 200)}`;
}

let lastProgressNote = 0;
export async function localChat(
  messages: { role: string; content: string }[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
  onNote?: (t: string) => void
) {
  const s = getSettings();
  // Les petits modèles ont un contexte réduit : on garde la fin de la conversation.
  let budget = 6000;
  const trimmed: typeof messages = [];
  for (const m of [...messages].reverse()) {
    if (m.role === 'system') continue;
    budget -= m.content.length;
    if (budget < 0 && trimmed.length) break;
    trimmed.unshift({ role: m.role, content: m.content.slice(-4000) });
  }
  const sys = messages.find(m => m.role === 'system');
  if (sys) trimmed.unshift({ role: 'system', content: sys.content.slice(0, 1500) });
  return run({ type: 'chat', model: s.localModel, messages: trimmed, maxTokens: 512 }, onToken, p => {
    if (p.status) onNote?.(`IA locale : ${p.status}`);
    else if (Date.now() - lastProgressNote > 4000) {
      lastProgressNote = Date.now();
      onNote?.(`Téléchargement du modèle local… ${Math.round(p.progress)} %`);
    }
  }, signal);
}

export function localPreload(onProgress: ProgressFn) {
  const s = getSettings();
  return run({ type: 'chat', model: s.localModel, messages: [{ role: 'user', content: 'Dis bonjour en un mot.' }], maxTokens: 8 }, undefined, onProgress);
}

export function transcribeLocal(audio: Float32Array, language: string, onProgress?: ProgressFn) {
  const s = getSettings();
  return run({ type: 'asr', model: s.voice.whisperModel, audio, language }, undefined, onProgress, undefined, [audio.buffer]);
}

export function captionLocal(imageDataUrl: string, onProgress?: ProgressFn) {
  return run({ type: 'caption', image: imageDataUrl }, undefined, onProgress);
}
