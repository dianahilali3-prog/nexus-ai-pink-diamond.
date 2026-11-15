import { callSpace, fetchSpaceFile, GradioError, uploadToSpace } from './gradio';
import { quickChat } from './providers';
import { getSettings } from './settings';

export interface Scene {
  id: string;
  title: string;
  caption: string;
  narration: string;
  imagePrompt: string;
  image?: Blob;
  imageUrl?: string;
  status?: 'idle' | 'working' | 'done' | 'error';
  error?: string;
}

/* =========================================================
   1. Storyboard : un rapport / projet → scènes
   ========================================================= */
export async function makeStoryboard(
  source: string,
  opts: { scenes: number; style: string; tone: string; signal?: AbortSignal }
): Promise<{ title: string; scenes: Scene[] }> {
  const text = source.length > 24000 ? `${source.slice(0, 16000)}\n[…]\n${source.slice(-6000)}` : source;
  const { text: raw } = await quickChat(
    [
      {
        role: 'system',
        content: `Tu es directeur artistique et monteur vidéo. À partir du document fourni, crée un storyboard de ${opts.scenes} scènes qui raconte ou résume fidèlement son contenu (pas d'invention de chiffres).
Réponds UNIQUEMENT avec du JSON valide, sans texte autour, au format :
{"title":"titre court","scenes":[{"title":"titre de scène (5 mots max)","caption":"texte affiché à l'écran, 18 mots max, en français","narration":"phrase de voix off en français, 30 mots max","imagePrompt":"English prompt for an image generator, 30-50 words, commas only, no semicolons, concrete visual scene, ${opts.style}, no text, no letters, no watermark"}]}
Ton : ${opts.tone}. Garde une cohérence visuelle (mêmes couleurs, même style) entre les scènes.`
      },
      { role: 'user', content: text }
    ],
    { signal: opts.signal, temperature: 0.6, maxTokens: 3000, reasoning: 'low' }
  );
  const json = extractJson(raw);
  const scenes = (Array.isArray(json?.scenes) ? json.scenes : []).slice(0, 12).map((s: Record<string, unknown>, i: number) => ({
    id: `${Date.now()}-${i}`,
    title: String(s.title ?? `Scène ${i + 1}`).slice(0, 80),
    caption: String(s.caption ?? '').slice(0, 200),
    narration: String(s.narration ?? s.caption ?? '').slice(0, 400),
    imagePrompt: String(s.imagePrompt ?? s.prompt ?? s.caption ?? '').slice(0, 1200),
    status: 'idle' as const
  }));
  if (!scenes.length) throw new Error('Le modèle n’a pas produit de storyboard exploitable. Réessaie (ou raccourcis le texte).');
  return { title: String(json?.title ?? 'Mon projet').slice(0, 90), scenes };
}

export function extractJson(raw: string): any {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
    } catch {
      return null;
    }
  }
}

/* =========================================================
   2. Montage vidéo dans le navigateur (canvas + MediaRecorder)
   ========================================================= */
export function recorderSupport() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? null;
}

export interface RenderOptions {
  format: 'portrait' | 'landscape' | 'square';
  secondsPerScene: number;
  title: string;
  showCaptions: boolean;
  narration: boolean;
  signal?: AbortSignal;
  onProgress?: (ratio: number, text: string) => void;
}

const FORMATS = { portrait: [720, 1280], landscape: [1280, 720], square: [1080, 1080] } as const;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderSlideshow(scenes: Scene[], opts: RenderOptions): Promise<Blob> {
  const mime = recorderSupport();
  if (!mime) throw new Error('Ton navigateur ne peut pas enregistrer de vidéo (MediaRecorder absent). Essaie Chrome, Edge, Firefox ou Safari 15+.');
  const ready = scenes.filter(s => s.image);
  if (!ready.length) throw new Error('Génère d’abord les images des scènes.');
  const [W, H] = FORMATS[opts.format];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bitmaps = await Promise.all(ready.map(s => createImageBitmap(s.image!)));

  // Voix off optionnelle (Piper, open source, dans le navigateur).
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const voice: (AudioBuffer | null)[] = ready.map(() => null);
  if (opts.narration) {
    const { piperSynth } = await import('./speech');
    for (let i = 0; i < ready.length; i++) {
      if (opts.signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
      opts.onProgress?.(i / ready.length / 3, `Voix off ${i + 1}/${ready.length} (Piper)…`);
      try {
        const wav = await piperSynth(ready[i].narration || ready[i].caption, getSettings().voice.piperVoice, t => opts.onProgress?.(0, t));
        voice[i] = await audioCtx.decodeAudioData(await wav.arrayBuffer());
      } catch (e) {
        throw new Error(`Voix off impossible : ${e instanceof Error ? e.message : e}. Décoche « voix off » pour une vidéo muette.`);
      }
    }
  }

  const TITLE = opts.title ? 2.6 : 0;
  const FADE = 0.7;
  const durations = ready.map((_, i) => Math.max(opts.secondsPerScene, (voice[i]?.duration ?? 0) + 0.8));
  const starts: number[] = [];
  durations.reduce((t, d, i) => { starts[i] = t; return t + d; }, TITLE);
  const total = TITLE + durations.reduce((a, b) => a + b, 0);

  const stream = canvas.captureStream(30);
  const tracks = [...stream.getVideoTracks()];
  if (opts.narration) tracks.push(...dest.stream.getAudioTracks());
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const finished = new Promise<void>(res => (rec.onstop = () => res()));

  const drawImage = (bmp: ImageBitmap, t: number, dir: number, alpha: number) => {
    const zoom = 1.06 + 0.1 * t;
    const scale = Math.max(W / bmp.width, H / bmp.height) * zoom;
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    const x = (W - w) / 2 + dir * (t - 0.5) * W * 0.05;
    const y = (H - h) / 2 + (dir > 0 ? -1 : 1) * (t - 0.5) * H * 0.03;
    ctx.globalAlpha = alpha;
    ctx.drawImage(bmp, x, y, w, h);
    ctx.globalAlpha = 1;
  };

  const drawCaption = (scene: Scene, alpha: number) => {
    if (!opts.showCaptions || !scene.caption) return;
    const fs = Math.round(Math.min(W, H) * 0.045);
    ctx.font = `600 ${fs}px "DM Sans", system-ui, sans-serif`;
    const lines = wrap(ctx, scene.caption, W * 0.82);
    const lh = fs * 1.3;
    const boxH = lines.length * lh + fs * 1.4;
    const y = H - boxH - H * 0.06;
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, y, 0, y + boxH);
    g.addColorStop(0, 'rgba(36,16,34,0.78)');
    g.addColorStop(1, 'rgba(22,10,22,0.86)');
    ctx.fillStyle = g;
    roundRect(ctx, W * 0.06, y, W * 0.88, boxH, fs * 0.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(246,182,210,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff4fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + fs * 0.7 + i * lh));
    ctx.globalAlpha = 1;
  };

  const drawTitle = (t: number) => {
    const g = ctx.createRadialGradient(W * 0.7, H * 0.35, 10, W / 2, H / 2, Math.max(W, H));
    g.addColorStop(0, '#5a2a4c');
    g.addColorStop(1, '#160e17');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const a = Math.min(1, t / 0.6) * Math.min(1, (TITLE - t) / 0.5);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#f6b6d2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.round(Math.min(W, H) * 0.075);
    ctx.font = `600 ${fs}px "Playfair Display", Georgia, serif`;
    wrap(ctx, opts.title, W * 0.84).forEach((l, i, arr) => ctx.fillText(l, W / 2, H / 2 + (i - (arr.length - 1) / 2) * fs * 1.2));
    ctx.font = `600 ${Math.round(fs * 0.28)}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#d8b879';
    ctx.fillText('✦  NEXUS AI  ✦', W / 2, H * 0.82);
    ctx.globalAlpha = 1;
  };

  rec.start(500);
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
  const t0 = audioCtx.currentTime + 0.05;
  if (opts.narration) voice.forEach((buf, i) => {
    if (!buf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(t0 + starts[i] + 0.3);
  });
  const clock0 = performance.now();

  await new Promise<void>((resolve, reject) => {
    const frame = () => {
      if (opts.signal?.aborted) { rec.stop(); reject(new DOMException('Arrêté', 'AbortError')); return; }
      const t = (performance.now() - clock0) / 1000;
      if (t >= total) { resolve(); return; }
      ctx.fillStyle = '#160e17';
      ctx.fillRect(0, 0, W, H);
      if (t < TITLE) drawTitle(t);
      else {
        let i = starts.findIndex((s, k) => t >= s && t < s + durations[k]);
        if (i < 0) i = ready.length - 1;
        const local = (t - starts[i]) / durations[i];
        drawImage(bitmaps[i], local, i % 2 ? -1 : 1, 1);
        const intoNext = t - (starts[i] + durations[i] - FADE);
        if (i + 1 < ready.length && intoNext > 0) drawImage(bitmaps[i + 1], 0, (i + 1) % 2 ? -1 : 1, intoNext / FADE);
        const capA = Math.min(1, (t - starts[i]) / 0.5) * Math.min(1, (starts[i] + durations[i] - t) / 0.4);
        drawCaption(ready[i], Math.max(0, capA));
        if (t < TITLE + FADE) { ctx.globalAlpha = 1 - (t - TITLE) / FADE; drawTitle(TITLE - 0.01); ctx.globalAlpha = 1; }
      }
      opts.onProgress?.(1 / 3 + (2 / 3) * (t / total), `Montage : ${Math.round(t)} / ${Math.round(total)} s (garde l’écran allumé)`);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await finished;
  audioCtx.close().catch(() => {});
  bitmaps.forEach(b => b.close());
  return new Blob(chunks, { type: mime.split(';')[0] });
}

/* =========================================================
   3. Vidéo générée par IA (expérimental)
   ========================================================= */
const LTX_SPACE = 'https://lightricks-ltx-video-distilled.hf.space';

export async function ltxVideo(
  prompt: string,
  opts: { format: 'portrait' | 'landscape' | 'square'; seconds: number; signal?: AbortSignal; onStatus?: (t: string) => void }
) {
  const token = getSettings().keys.hf.trim() || undefined;
  const [h, w] = opts.format === 'portrait' ? [704, 512] : opts.format === 'square' ? [512, 512] : [512, 704];
  const out = await callSpace(
    LTX_SPACE,
    'text_to_video',
    [prompt, 'worst quality, inconsistent motion, blurry, jittery, distorted', null, null, h, w, 'text-to-video', Math.min(4, Math.max(2, opts.seconds)), 9, 42, true, 1, true],
    { token, signal: opts.signal, onStatus: s => opts.onStatus?.(`LTX-Video (Hugging Face) : ${s.text}`), timeoutMs: 420_000 }
  );
  return fetchSpaceFile(out[0], token);
}

export async function pollinationsVideo(prompt: string, seconds: number, signal?: AbortSignal) {
  const s = getSettings();
  const key = s.keys.pollinations.trim();
  if (!key) throw new Error('Pollinations+ : ajoute ta clé dans Réglages.');
  const res = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt.slice(0, 1200))}?model=${encodeURIComponent(s.video.keyModel)}&duration=${seconds}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal
  });
  if (res.status === 402) throw new Error('Pollinations+ : crédit Pollen insuffisant pour la vidéo.');
  if (res.status === 401 || res.status === 403) throw new Error('Pollinations+ : clé refusée ou sans permission « video ».');
  if (!res.ok) throw new Error(`Pollinations+ : erreur ${res.status}.`);
  const blob = await res.blob();
  if (!blob.type.startsWith('video/')) throw new Error('Pollinations+ : réponse inattendue (pas une vidéo).');
  return blob;
}

/* =========================================================
   4. Wan (Alibaba, poids ouverts Apache-2.0) : image → vidéo
   Espaces Hugging Face communautaires (ZeroGPU, quota quotidien).
   ========================================================= */
const WAN_SPACES = [
  { url: 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space', label: 'Wan 2.2', build: (img: unknown, p: string, sec: number) => [img, p, 6, '', sec, 1, 1, 42, true] },
  { url: 'https://multimodalart-wan2-1-fast.hf.space', label: 'Wan 2.1', build: (img: unknown, p: string, sec: number) => [img, p, 512, 896, '', Math.min(sec, 3), 1, 4, 42, true] }
];

export async function wanVideo(image: Blob, prompt: string, opts: { seconds: number; signal?: AbortSignal; onStatus?: (t: string) => void }) {
  const token = getSettings().keys.hf.trim() || undefined;
  const errors: string[] = [];
  for (const sp of WAN_SPACES) {
    try {
      opts.onStatus?.(`${sp.label} (Hugging Face) : envoi de l’image…`);
      const file = await uploadToSpace(sp.url, image, 'scene.png', token);
      const out = await callSpace(sp.url, 'generate_video', sp.build(file, prompt, opts.seconds), {
        token,
        signal: opts.signal,
        onStatus: s => opts.onStatus?.(`${sp.label} : ${s.text}`),
        timeoutMs: 420_000
      });
      return { blob: await fetchSpaceFile(out[0], token), engine: `${sp.label} (HF)` };
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      errors.push(`${sp.label} : ${e instanceof Error ? e.message : e}`);
      // Quota épuisé : inutile d’essayer l’autre espace (même quota ZeroGPU).
      if (e instanceof GradioError && e.quota) break;
    }
  }
  throw new Error(errors.join('\n'));
}
