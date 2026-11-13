import { useSyncExternalStore } from 'react';

export type ProviderId = 'pollinations' | 'pollinations-key' | 'openrouter' | 'groq' | 'custom' | 'local';
export type ImageEngine = 'auto' | 'pollinations' | 'flux-space' | 'pollinations-key';

export interface Settings {
  providerOrder: ProviderId[];
  enabled: Record<ProviderId, boolean>;
  models: Record<ProviderId, string>;
  keys: { pollinations: string; openrouter: string; groq: string; custom: string; hf: string };
  customBaseUrl: string;
  temperature: number;
  maxHistory: number;
  voice: {
    lang: string;
    voiceURI: string;
    rate: number;
    pitch: number;
    autoSpeak: boolean;
    ttsEngine: 'browser' | 'piper';
    piperVoice: string;
    sttEngine: 'browser' | 'whisper';
    whisperModel: string;
  };
  localModel: string;
  web: { wikiLang: string; searxUrl: string; readLinks: boolean };
  image: { engine: ImageEngine; autoEnhance: boolean; size: 'square' | 'portrait' | 'landscape'; keyModel: string };
  video: { keyModel: string };
  memoryEnabled: boolean;
  showReasoning: boolean;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providerOrder: ['pollinations', 'openrouter', 'groq', 'pollinations-key', 'custom', 'local'],
  enabled: { pollinations: true, 'pollinations-key': false, openrouter: false, groq: false, custom: false, local: false },
  models: {
    pollinations: 'openai',
    'pollinations-key': 'openai/gpt-5.4-nano',
    openrouter: 'google/gemma-4-31b-it:free',
    groq: 'llama-3.3-70b-versatile',
    custom: 'qwen2.5:3b',
    local: 'onnx-community/Qwen2.5-0.5B-Instruct'
  },
  keys: { pollinations: '', openrouter: '', groq: '', custom: '', hf: '' },
  customBaseUrl: 'http://localhost:11434/v1',
  temperature: 0.7,
  maxHistory: 24,
  voice: {
    lang: 'fr-FR',
    voiceURI: '',
    rate: 1,
    pitch: 1,
    autoSpeak: false,
    ttsEngine: 'browser',
    piperVoice: 'fr_FR-siwis-medium',
    sttEngine: 'browser',
    whisperModel: 'onnx-community/whisper-tiny'
  },
  localModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
  web: { wikiLang: 'fr', searxUrl: '', readLinks: true },
  image: { engine: 'auto', autoEnhance: true, size: 'square', keyModel: 'black-forest-labs/flux.1-schnell' },
  video: { keyModel: 'alibaba/wan-2.2-fast' },
  memoryEnabled: true,
  showReasoning: false,
  onboarded: false
};

const KEY = 'nexus.settings.v1';

function merge<T>(base: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = merge(b, v);
    else if (v !== undefined && (b === undefined || typeof v === typeof b)) out[k] = v;
  }
  return out as T;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = merge(DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    // Garantit que la liste contient chaque fournisseur exactement une fois.
    const all = DEFAULT_SETTINGS.providerOrder;
    s.providerOrder = [...s.providerOrder.filter((p, i, a) => all.includes(p) && a.indexOf(p) === i), ...all.filter(p => !s.providerOrder.includes(p))];
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let state: Settings = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return state;
}

export function setSettings(update: Partial<Settings> | ((s: Settings) => Settings)) {
  state = typeof update === 'function' ? update(state) : { ...state, ...update };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage plein ou bloqué : les réglages restent en mémoire */
  }
  listeners.forEach(l => l());
}

export function resetSettings() {
  setSettings(DEFAULT_SETTINGS);
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
