import { getSettings } from './settings';

/* =========================================================
   Détection des capacités
   ========================================================= */
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
type SRCtor = new () => SR;

const SRClass: SRCtor | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition)
    : undefined;

export const capabilities = {
  browserSTT: !!SRClass,
  browserTTS: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  mic: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  recorder: typeof window !== 'undefined' && 'MediaRecorder' in window,
  secure: typeof window !== 'undefined' && window.isSecureContext
};

export const LANGS = [
  { code: 'fr-FR', label: 'Français' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'nl-NL', label: 'Nederlands' }
];

export const PIPER_VOICES = [
  { id: 'fr_FR-siwis-medium', label: 'Siwis (femme, FR) — 63 Mo' },
  { id: 'fr_FR-upmc-medium', label: 'UPMC (FR) — 77 Mo' },
  { id: 'fr_FR-tom-medium', label: 'Tom (homme, FR) — 63 Mo' },
  { id: 'fr_FR-siwis-low', label: 'Siwis légère (FR) — 28 Mo' },
  { id: 'en_US-hfc_female-medium', label: 'HFC female (EN) — 63 Mo' },
  { id: 'en_US-ryan-medium', label: 'Ryan (EN) — 63 Mo' },
  { id: 'es_ES-davefx-medium', label: 'Davefx (ES) — 63 Mo' },
  { id: 'de_DE-thorsten-medium', label: 'Thorsten (DE) — 63 Mo' }
];

export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Whisper tiny (≈ 40 Mo, rapide)' },
  { id: 'onnx-community/whisper-base', label: 'Whisper base (≈ 80 Mo, plus précis)' },
  { id: 'onnx-community/whisper-small', label: 'Whisper small (≈ 250 Mo, ordinateur conseillé)' }
];

export const sttAvailable = () => {
  const s = getSettings();
  return s.voice.sttEngine === 'whisper' ? capabilities.mic && capabilities.recorder : capabilities.browserSTT;
};

/* =========================================================
   Reconnaissance vocale
   ========================================================= */
export interface ListenHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
  onLevel?: (level: number) => void;
  onStatus?: (text: string) => void;
}

export interface Listener {
  stop: () => void;
  abort: () => void;
}

const SR_ERRORS: Record<string, string> = {
  'not-allowed': 'Micro refusé. Autorise le micro pour ce site (icône à gauche de l’adresse, ou Réglages du téléphone → Safari/Chrome → Micro).',
  'service-not-allowed': 'La reconnaissance vocale est désactivée sur cet appareil (Réglages → Siri/Dictée sur iPhone).',
  'no-speech': 'Je n’ai rien entendu. Réessaie en parlant plus près du micro.',
  'audio-capture': 'Aucun micro détecté.',
  network: 'La reconnaissance vocale du navigateur a besoin d’Internet. Essaie le mode Whisper (hors ligne) dans Réglages → Voix.',
  'language-not-supported': 'Cette langue n’est pas reconnue par ton navigateur.'
};

export function listen(h: ListenHandlers): Listener {
  const s = getSettings();
  if (s.voice.sttEngine === 'whisper') return listenWhisper(h);
  if (!SRClass) {
    h.onError('Ton navigateur ne propose pas la reconnaissance vocale. Utilise Chrome, Edge ou Safari récent, ou active Whisper dans Réglages → Voix.');
    h.onEnd();
    return { stop() {}, abort() {} };
  }
  const rec = new SRClass();
  rec.lang = s.voice.lang;
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = '';
  let ended = false;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    h.onInterim?.((finalText + interim).trim());
  };
  rec.onerror = e => {
    if (e.error === 'aborted') return;
    h.onError(SR_ERRORS[e.error] ?? `Erreur de reconnaissance vocale (${e.error}).`);
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd();
  };
  try {
    rec.start();
    h.onStatus?.('J’écoute…');
  } catch (e) {
    h.onError(`Impossible de démarrer l’écoute : ${e instanceof Error ? e.message : e}`);
    h.onEnd();
  }
  return { stop: () => rec.stop(), abort: () => { ended = true; rec.abort(); h.onEnd(); } };
}

/** Enregistre jusqu’au silence puis transcrit avec Whisper dans le navigateur. */
function listenWhisper(h: ListenHandlers): Listener {
  let stopped = false;
  let aborted = false;
  let stopFn = () => { stopped = true; };
  (async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      h.onError(name === 'NotAllowedError' ? SR_ERRORS['not-allowed'] : name === 'NotFoundError' ? SR_ERRORS['audio-capture'] : `Micro indisponible : ${(e as Error).message}`);
      h.onEnd();
      return;
    }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const started = performance.now();
    let lastVoice = performance.now();
    let heard = false;
    const tick = () => {
      if (rec.state !== 'recording') return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      h.onLevel?.(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > 0.02) { lastVoice = now; heard = true; }
      if (stopped || (heard && now - lastVoice > 1600) || now - started > 60_000 || (!heard && now - started > 9000)) rec.stop();
      else requestAnimationFrame(tick);
    };
    stopFn = () => { stopped = true; if (rec.state === 'recording') rec.stop(); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      h.onLevel?.(0);
      try {
        if (aborted) return;
        if (!heard) { h.onError(SR_ERRORS['no-speech']); return; }
        h.onStatus?.('Transcription (Whisper, sur l’appareil)…');
        const blob = new Blob(chunks, { type: rec.mimeType });
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
        const node = off.createBufferSource();
        node.buffer = decoded;
        node.connect(off.destination);
        node.start();
        const rendered = await off.startRendering();
        const { transcribeLocal } = await import('./localllm');
        const lang = getSettings().voice.lang.split('-')[0];
        const text = await transcribeLocal(new Float32Array(rendered.getChannelData(0)), lang === 'fr' ? 'french' : lang, p => {
          if (p.file) h.onStatus?.(`Téléchargement de Whisper… ${Math.round(p.progress)} %`);
        });
        if (text) { h.onInterim?.(text); h.onFinal(text); } else h.onError(SR_ERRORS['no-speech']);
      } catch (e) {
        h.onError(`Whisper : ${e instanceof Error ? e.message : e}`);
      } finally {
        ctx.close().catch(() => {});
        h.onEnd();
      }
    };
    rec.start(250);
    h.onStatus?.('J’écoute… (arrêt automatique après un silence)');
    requestAnimationFrame(tick);
  })();
  return { stop: () => stopFn(), abort: () => { aborted = true; stopFn(); } };
}

/* =========================================================
   Synthèse vocale
   ========================================================= */
export function cleanForSpeech(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' (bloc de code) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/[*_~>#]/g, '')
    .replace(/https?:\/\/\S+/g, 'lien')
    .replace(/\[\d+]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentences(text: string, max = 220) {
  const parts = text.match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); }
    else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export function getVoices(): SpeechSynthesisVoice[] {
  return capabilities.browserTTS ? speechSynthesis.getVoices() : [];
}

export function onVoicesChanged(cb: () => void) {
  if (!capabilities.browserTTS) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

let speakToken = 0;
let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  speakToken++;
  if (capabilities.browserTTS) speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
}

export function isSpeaking() {
  return (capabilities.browserTTS && speechSynthesis.speaking) || !!currentAudio;
}

/** Lit un texte à voix haute. La promesse se résout à la fin (ou à l’arrêt). */
export async function speak(markdown: string, onStatus?: (t: string) => void): Promise<void> {
  stopSpeaking();
  const my = ++speakToken;
  const text = cleanForSpeech(markdown);
  if (!text) return;
  const s = getSettings();
  if (s.voice.ttsEngine === 'piper') {
    try {
      await speakPiper(text, my, onStatus);
      return;
    } catch (e) {
      onStatus?.(`Piper indisponible (${e instanceof Error ? e.message : e}) → voix du navigateur.`);
      if (my !== speakToken) return;
    }
  }
  if (!capabilities.browserTTS) throw new Error('Ton navigateur ne sait pas lire à voix haute. Active la voix Piper dans Réglages → Voix.');
  const voices = getVoices();
  const voice =
    voices.find(v => v.voiceURI === s.voice.voiceURI) ??
    voices.find(v => v.lang.replace('_', '-').toLowerCase() === s.voice.lang.toLowerCase()) ??
    voices.find(v => v.lang.toLowerCase().startsWith(s.voice.lang.slice(0, 2).toLowerCase()));
  for (const chunk of sentences(text)) {
    if (my !== speakToken) return;
    await new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = voice?.lang ?? s.voice.lang;
      if (voice) u.voice = voice;
      u.rate = s.voice.rate;
      u.pitch = s.voice.pitch;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      // Sécurité : certains navigateurs n’émettent jamais « end ».
      setTimeout(resolve, 2000 + chunk.length * 120 / s.voice.rate);
    });
  }
}

type PiperModule = typeof import('@mintplex-labs/piper-tts-web');
let piperMod: Promise<PiperModule> | null = null;
export function loadPiper() {
  piperMod ??= import('@mintplex-labs/piper-tts-web');
  return piperMod;
}

// La bibliothèque pointe par défaut vers une ancienne version du moteur ONNX :
// on fixe la version réellement installée (1.31.1) pour éviter l'erreur « no available backend ».
const ORT_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
type Session = { predict(text: string): Promise<Blob> };
let session: Promise<Session> | null = null;
let sessionVoice = '';

export async function piperSynth(text: string, voiceId = getSettings().voice.piperVoice, onStatus?: (t: string) => void): Promise<Blob> {
  const tts = await loadPiper();
  if (!session || sessionVoice !== voiceId) {
    (tts.TtsSession as unknown as { _instance: unknown })._instance = null; // nouvelle voix = nouvelle session
    sessionVoice = voiceId;
    session = tts.TtsSession.create({
      voiceId: voiceId as never,
      progress: (p: { loaded: number; total: number }) => {
        if (p.total) onStatus?.(`Téléchargement de la voix Piper… ${Math.round((p.loaded * 100) / p.total)} %`);
      },
      wasmPaths: { onnxWasm: ORT_WASM, piperData: `${tts.WASM_BASE}.data`, piperWasm: `${tts.WASM_BASE}.wasm` }
    }) as Promise<Session>;
    session.catch(() => { session = null; });
  }
  return (await session).predict(text);
}

async function speakPiper(text: string, my: number, onStatus?: (t: string) => void) {
  const s = getSettings();
  const parts = sentences(text, 300);
  let next: Promise<Blob> | null = piperSynth(parts[0], s.voice.piperVoice, onStatus);
  for (let i = 0; i < parts.length; i++) {
    const blob: Blob = await next!;
    next = i + 1 < parts.length ? piperSynth(parts[i + 1], s.voice.piperVoice) : null;
    if (my !== speakToken) return;
    await new Promise<void>((resolve, reject) => {
      const a = new Audio(URL.createObjectURL(blob));
      currentAudio = a;
      a.playbackRate = s.voice.rate;
      a.onended = () => { URL.revokeObjectURL(a.src); currentAudio = null; resolve(); };
      a.onerror = () => { currentAudio = null; reject(new Error('lecture audio impossible')); };
      a.play().catch(reject);
    });
  }
}

/** Demande l’autorisation du micro (affiche un message clair si refus). */
export async function ensureMic(): Promise<string | null> {
  if (!capabilities.secure) return 'Le micro exige une connexion sécurisée (https).';
  if (!capabilities.mic) return null; // la reconnaissance du navigateur gère elle-même l’autorisation
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true });
    st.getTracks().forEach(t => t.stop());
    return null;
  } catch (e) {
    const name = (e as DOMException)?.name;
    return name === 'NotAllowedError' ? SR_ERRORS['not-allowed'] : name === 'NotFoundError' ? SR_ERRORS['audio-capture'] : `Micro indisponible (${name}).`;
  }
}
