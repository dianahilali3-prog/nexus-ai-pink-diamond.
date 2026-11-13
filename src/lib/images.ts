import { callSpace, fetchSpaceFile } from './gradio';
import { quickChat } from './providers';
import { getSettings, type ImageEngine } from './settings';

export const SIZES = {
  square: { w: 1024, h: 1024, label: 'Carré' },
  portrait: { w: 768, h: 1344, label: 'Portrait' },
  landscape: { w: 1344, h: 768, label: 'Paysage' }
} as const;

export const STYLES = [
  { id: 'none', label: 'Libre', suffix: '' },
  { id: 'photo', label: 'Photo', suffix: ', photorealistic, professional photography, natural light, 50mm, high detail' },
  { id: 'cinema', label: 'Cinéma', suffix: ', cinematic still, dramatic lighting, anamorphic, film grain, color graded' },
  { id: 'luxe', label: 'Luxe rose', suffix: ', luxury editorial, soft pink and champagne palette, pearl and chrome details, elegant' },
  { id: 'illus', label: 'Illustration', suffix: ', detailed digital illustration, clean lines, vibrant colors' },
  { id: 'aquarelle', label: 'Aquarelle', suffix: ', watercolor painting, soft washes, paper texture' },
  { id: 'anime', label: 'Anime', suffix: ', anime style, cel shading, expressive' },
  { id: '3d', label: '3D', suffix: ', 3D render, octane, soft global illumination, studio backdrop' },
  { id: 'logo', label: 'Logo', suffix: ', minimalist vector logo, flat design, centered, plain background' }
];

export interface ImageResult {
  blob: Blob;
  engine: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
}

export type StatusFn = (text: string) => void;

const FLUX_SPACE = 'https://black-forest-labs-flux-1-schnell.hf.space';

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  signal?.addEventListener('abort', () => c.abort());
  return { signal: c.signal, done: () => clearTimeout(t), timedOut: () => c.signal.aborted && !signal?.aborted };
}

async function checkImage(res: Response, who: string) {
  if (res.status === 429) throw new Error(`${who} : trop de demandes, attends quelques secondes.`);
  if (res.status === 401 || res.status === 403) throw new Error(`${who} : clé requise ou refusée.`);
  if (res.status === 402) throw new Error(`${who} : crédit insuffisant.`);
  if (!res.ok) throw new Error(`${who} : erreur ${res.status}.`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') || blob.size < 1000) throw new Error(`${who} : réponse inattendue (pas une image).`);
  return blob;
}

export async function pollinationsImage(prompt: string, w: number, h: number, seed: number, signal?: AbortSignal) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 1500))}?width=${w}&height=${h}&seed=${seed}&nologo=true&private=true&safe=true&referrer=nexus-ai`;
  const t = withTimeout(signal, 150_000);
  try {
    return await checkImage(await fetch(url, { signal: t.signal }), 'Pollinations');
  } catch (e) {
    if (t.timedOut()) throw new Error('Pollinations : délai dépassé (service chargé).');
    throw e;
  } finally {
    t.done();
  }
}

export async function pollinationsKeyImage(prompt: string, w: number, h: number, seed: number, signal?: AbortSignal) {
  const s = getSettings();
  const key = s.keys.pollinations.trim();
  if (!key) throw new Error('Pollinations+ : ajoute ta clé dans Réglages.');
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 1500))}?model=${encodeURIComponent(s.image.keyModel)}&width=${w}&height=${h}&seed=${seed}&nologo=true&private=true&safe=true`;
  const t = withTimeout(signal, 180_000);
  try {
    return await checkImage(await fetch(url, { signal: t.signal, headers: { Authorization: `Bearer ${key}` } }), 'Pollinations+');
  } finally {
    t.done();
  }
}

export async function fluxSpaceImage(prompt: string, w: number, h: number, seed: number, onStatus?: StatusFn, signal?: AbortSignal) {
  const token = getSettings().keys.hf.trim() || undefined;
  // FLUX schnell : dimensions multiples de 32, 1024 px max conseillé pour limiter le quota.
  const fit = (n: number) => Math.max(256, Math.min(1024, Math.round(n / 32) * 32));
  const out = await callSpace(FLUX_SPACE, 'infer', [prompt, seed, false, fit(w), fit(h), 4], {
    token,
    signal,
    onStatus: s => onStatus?.(`FLUX (Hugging Face) : ${s.text}`),
    timeoutMs: 240_000
  });
  return fetchSpaceFile(out[0], token);
}

export async function generateImage(
  prompt: string,
  opts: { width: number; height: number; seed?: number; engine?: ImageEngine; signal?: AbortSignal; onStatus?: StatusFn }
): Promise<ImageResult> {
  const s = getSettings();
  const engine = opts.engine ?? s.image.engine;
  const seed = opts.seed ?? Math.floor(Math.random() * 2_000_000_000);
  const chain: Exclude<ImageEngine, 'auto'>[] =
    engine === 'auto'
      ? ['pollinations', 'flux-space', ...(s.keys.pollinations.trim() ? (['pollinations-key'] as const) : [])]
      : [engine];
  const errors: string[] = [];
  for (const e of chain) {
    if (opts.signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
    try {
      let blob: Blob;
      if (e === 'pollinations') {
        opts.onStatus?.('Pollinations : création de l’image…');
        blob = await pollinationsImage(prompt, opts.width, opts.height, seed, opts.signal);
      } else if (e === 'pollinations-key') {
        opts.onStatus?.(`Pollinations+ (${s.image.keyModel}) : création…`);
        blob = await pollinationsKeyImage(prompt, opts.width, opts.height, seed, opts.signal);
      } else {
        opts.onStatus?.('FLUX (Hugging Face) : connexion…');
        blob = await fluxSpaceImage(prompt, opts.width, opts.height, seed, opts.onStatus, opts.signal);
      }
      return { blob, engine: e === 'pollinations' ? 'Pollinations' : e === 'flux-space' ? 'FLUX.1 schnell (HF)' : `Pollinations+ ${s.image.keyModel}`, prompt, seed, width: opts.width, height: opts.height };
    } catch (err) {
      if (opts.signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
      errors.push(err instanceof Error ? err.message : String(err));
      if (chain.indexOf(e) < chain.length - 1) opts.onStatus?.(`${errors.at(-1)} → essai du moteur suivant…`);
    }
  }
  throw new Error(errors.join('\n'));
}

/** Demande au chat de transformer une idée en prompt d’image détaillé (en anglais, mieux compris). */
export async function enhancePrompt(idea: string, style = '', signal?: AbortSignal): Promise<string> {
  const { text } = await quickChat(
    [
      {
        role: 'system',
        content:
          'You are an expert prompt engineer for text-to-image models (FLUX, SDXL). Rewrite the user idea into ONE vivid English prompt of 40 to 80 words: subject, setting, composition, lighting, colors, mood, style, camera/medium. Keep every concrete detail requested (names of objects, colors, text to display). Do not add people if none were requested. Output ONLY the prompt, no quotes, no preamble.'
      },
      { role: 'user', content: `${idea}${style ? `\nStyle: ${style}` : ''}` }
    ],
    { signal, temperature: 0.8, maxTokens: 400 }
  );
  const clean = text.replace(/^["'«\s]+|["'»\s]+$/g, '').replace(/^(prompt|here.*?):\s*/i, '').trim();
  return clean || idea;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function extFor(mime: string) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  return 'jpg';
}

export async function shareBlob(blob: Blob, name: string, text: string) {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: 'NEXUS AI', text });
    return true;
  }
  return false;
}
