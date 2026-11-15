/// <reference lib="webworker" />
// Exécute les modèles open source (Transformers.js / ONNX Runtime) hors du fil principal.
import {
  env,
  pipeline,
  TextStreamer,
  InterruptableStoppingCriteria,
  type TextGenerationPipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ImageToTextPipeline
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

type Req =
  | { id: number; type: 'chat'; model: string; messages: { role: string; content: string }[]; maxTokens: number }
  | { id: number; type: 'asr'; model: string; audio: Float32Array; language: string }
  | { id: number; type: 'caption'; image: string }
  | { id: number; type: 'depth'; image: string }
  | { id: number; type: 'stop' };

// Typage simplifié : les surcharges de pipeline() sont trop complexes pour TypeScript.
const makePipe = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;
const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const stopping = new InterruptableStoppingCriteria();
const cache = new Map<string, Promise<unknown>>();

async function hasWebGPU() {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

function progress(id: number) {
  return (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
    if (p.status === 'progress') post({ id, type: 'progress', file: p.file, progress: p.progress ?? 0, loaded: p.loaded, total: p.total });
  };
}

async function load<T>(key: string, factory: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, factory().catch(e => { cache.delete(key); throw e; }));
  return cache.get(key) as Promise<T>;
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const req = ev.data;
  if (req.type === 'stop') { stopping.interrupt(); return; }
  try {
    if (req.type === 'chat') {
      const gpu = await hasWebGPU();
      post({ id: req.id, type: 'status', text: gpu ? 'WebGPU' : 'WASM (processeur)' });
      const gen = await load<TextGenerationPipeline>(`chat:${req.model}:${gpu}`, () =>
        makePipe('text-generation', req.model, {
          device: gpu ? 'webgpu' : 'wasm',
          dtype: gpu ? 'q4f16' : 'q4',
          progress_callback: progress(req.id)
        }) as Promise<TextGenerationPipeline>
      );
      stopping.reset();
      const streamer = new TextStreamer(gen.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (t: string) => post({ id: req.id, type: 'token', text: t })
      });
      const out = (await gen(req.messages as never, {
        max_new_tokens: req.maxTokens,
        do_sample: false,
        streamer,
        stopping_criteria: stopping
      } as never)) as unknown as { generated_text: { content: string }[] }[];
      const last = out[0]?.generated_text?.at?.(-1)?.content ?? '';
      post({ id: req.id, type: 'done', text: last });
    } else if (req.type === 'asr') {
      const asr = await load<AutomaticSpeechRecognitionPipeline>(`asr:${req.model}`, () =>
        makePipe('automatic-speech-recognition', req.model, { device: 'wasm', dtype: 'q8', progress_callback: progress(req.id) }) as Promise<AutomaticSpeechRecognitionPipeline>
      );
      const out = (await asr(req.audio, { language: req.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 } as never)) as { text: string };
      post({ id: req.id, type: 'done', text: out.text?.trim() ?? '' });
    } else if (req.type === 'depth') {
      // Depth Anything V2 Small (Apache-2.0, ~27 Mo) : profondeur relative, clair = proche.
      const est = await load<(img: string) => Promise<unknown>>('depth', () =>
        makePipe('depth-estimation', 'onnx-community/depth-anything-v2-small', { device: 'wasm', dtype: 'q8', progress_callback: progress(req.id) }) as Promise<(img: string) => Promise<unknown>>
      );
      const out = (await est(req.image)) as { depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number } };
      const d = out.depth;
      const data = new Uint8Array(d.data.length / d.channels);
      for (let i = 0; i < data.length; i++) data[i] = d.data[i * d.channels];
      (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: req.id, type: 'done', depth: { data, width: d.width, height: d.height } }, [data.buffer]);
    } else if (req.type === 'caption') {
      const cap = await load<ImageToTextPipeline>('caption', () =>
        makePipe('image-to-text', 'Xenova/vit-gpt2-image-captioning', { device: 'wasm', dtype: 'q8', progress_callback: progress(req.id) }) as Promise<ImageToTextPipeline>
      );
      const out = (await cap(req.image, { max_new_tokens: 40 } as never)) as { generated_text: string }[];
      post({ id: req.id, type: 'done', text: out[0]?.generated_text ?? '' });
    }
  } catch (e) {
    post({ id: req.id, type: 'error', text: e instanceof Error ? e.message : String(e) });
  }
};
