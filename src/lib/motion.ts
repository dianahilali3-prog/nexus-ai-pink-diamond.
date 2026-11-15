/**
 * Moteur vidéo local de NEXUS (code original, sans service en ligne).
 * Une image + sa carte de profondeur (Depth Anything V2, calculée sur l’appareil)
 * → mouvement de caméra 3D (parallaxe), effets, sous-titres → vidéo MP4/WebM.
 * Fonctionne hors ligne et sans limite une fois le modèle de profondeur téléchargé (~27 Mo).
 */
import type { DepthMap } from './localllm';

export type MotionId = 'auto' | 'dolly-in' | 'dolly-out' | 'orbit' | 'pan-right' | 'pan-left' | 'crane-up' | 'vertigo' | 'float';
export type EffectId = 'none' | 'sparkles' | 'bokeh' | 'snow' | 'rain' | 'lightleak' | 'fog' | 'embers' | 'petals';
export type Format = 'portrait' | 'landscape' | 'square';

export const MOTIONS: { id: MotionId; label: string }[] = [
  { id: 'auto', label: 'Automatique (varié)' },
  { id: 'dolly-in', label: 'Travelling avant' },
  { id: 'dolly-out', label: 'Travelling arrière' },
  { id: 'orbit', label: 'Orbite' },
  { id: 'pan-right', label: 'Panoramique →' },
  { id: 'pan-left', label: 'Panoramique ←' },
  { id: 'crane-up', label: 'Grue (montée)' },
  { id: 'vertigo', label: 'Effet vertigo' },
  { id: 'float', label: 'Flottement doux' }
];
export const EFFECTS: { id: EffectId; label: string }[] = [
  { id: 'none', label: 'Aucun' },
  { id: 'sparkles', label: 'Paillettes ✨' },
  { id: 'bokeh', label: 'Bokeh lumineux' },
  { id: 'petals', label: 'Pétales roses' },
  { id: 'snow', label: 'Neige' },
  { id: 'rain', label: 'Pluie' },
  { id: 'embers', label: 'Braises' },
  { id: 'lightleak', label: 'Halo de lumière' },
  { id: 'fog', label: 'Brume' }
];
export const FORMAT_SIZE: Record<Format, [number, number]> = { portrait: [720, 1280], landscape: [1280, 720], square: [1080, 1080] };

/* =========================================================
   Préparation de la profondeur : lissage pour éviter les déchirures
   ========================================================= */
export function prepareDepth(d: DepthMap, maxSide = 384): ImageData {
  const scale = Math.min(1, maxSide / Math.max(d.width, d.height));
  const w = Math.max(8, Math.round(d.width * scale));
  const h = Math.max(8, Math.round(d.height * scale));
  const small = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    small[y * w + x] = d.data[Math.min(d.height - 1, Math.floor(y / scale)) * d.width + Math.min(d.width - 1, Math.floor(x / scale))] / 255;
  }
  // Flou en boîte séparable (2 passes) : bords plus doux.
  const blur = (src: Float32Array, r: number) => {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1);
        acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  };
  const sm = blur(blur(small, 3), 2);
  let lo = 1, hi = 0;
  for (const v of sm) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const img = new ImageData(w, h);
  for (let i = 0; i < sm.length; i++) {
    const v = Math.round(((sm[i] - lo) / Math.max(1e-3, hi - lo)) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

/* =========================================================
   Rendu WebGL : parallaxe guidée par la profondeur
   ========================================================= */
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D img; uniform sampler2D dep;
uniform vec2 cover;      // échelle « cover » (remplir le cadre)
uniform vec2 shift;      // déplacement latéral de la caméra
uniform float zoom;      // zoom global
uniform float dzoom;     // zoom différentiel (travelling)
uniform float focus;     // plan de netteté (0 loin … 1 proche)
uniform float vignette;
vec2 toImg(vec2 uv){ return (uv - 0.5) * cover + 0.5; }
void main(){
  vec2 uv = vec2(v.x, 1.0 - v.y);
  vec2 c = (uv - 0.5) / zoom + 0.5;
  float d = texture2D(dep, toImg(c)).r;
  vec2 q = c;
  for (int i = 0; i < 4; i++) {
    float k = d - focus;
    q = 0.5 + (c - 0.5) / (1.0 + dzoom * k) - shift * k;
    d = texture2D(dep, toImg(q)).r;
  }
  vec2 t = clamp(toImg(q), 0.001, 0.999);
  vec3 col = texture2D(img, t).rgb;
  float r = length(uv - 0.5);
  col *= 1.0 - vignette * smoothstep(0.35, 0.85, r);
  gl_FragColor = vec4(col, 1.0);
}`;

export class ParallaxRenderer {
  canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture[] = [];
  private cover: [number, number] = [1, 1];
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(public W: number, public H: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL indisponible sur cet appareil : impossible de créer la vidéo 3D.');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader : ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programme WebGL : ' + gl.getProgramInfoLog(p));
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['img', 'dep', 'cover', 'shift', 'zoom', 'dzoom', 'focus', 'vignette']) this.loc[n] = gl.getUniformLocation(p, n);
    gl.uniform1i(this.loc.img, 0);
    gl.uniform1i(this.loc.dep, 1);
    this.tex = [gl.createTexture()!, gl.createTexture()!];
  }

  private upload(unit: number, src: TexImageSource) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[unit]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setScene(image: ImageBitmap | HTMLCanvasElement, depth: ImageData) {
    // Les GPU mobiles limitent la taille des textures : on réduit si besoin.
    let src: TexImageSource = image;
    const max = 2048;
    if (image.width > max || image.height > max) {
      const s = max / Math.max(image.width, image.height);
      const c = document.createElement('canvas');
      c.width = Math.round(image.width * s);
      c.height = Math.round(image.height * s);
      c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
      src = c;
    }
    this.upload(0, src);
    const dc = document.createElement('canvas');
    dc.width = depth.width;
    dc.height = depth.height;
    dc.getContext('2d')!.putImageData(depth, 0, 0);
    this.upload(1, dc);
    // Mode « cover » : l’image remplit le cadre sans déformation.
    const ia = image.width / image.height;
    const fa = this.W / this.H;
    this.cover = ia > fa ? [fa / ia, 1] : [1, ia / fa];
  }

  render(cam: Camera) {
    const gl = this.gl;
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
    gl.uniform2f(this.loc.cover, this.cover[0], this.cover[1]);
    gl.uniform2f(this.loc.shift, cam.sx, cam.sy);
    gl.uniform1f(this.loc.zoom, cam.zoom);
    gl.uniform1f(this.loc.dzoom, cam.dzoom);
    gl.uniform1f(this.loc.focus, cam.focus);
    gl.uniform1f(this.loc.vignette, 0.35);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

export interface Camera { sx: number; sy: number; zoom: number; dzoom: number; focus: number }
const ease = (t: number) => t * t * (3 - 2 * t);

export function cameraAt(motion: MotionId, t: number, strength = 1): Camera {
  const e = ease(t);
  const a = 0.045 * strength;
  switch (motion) {
    case 'dolly-out': return { sx: 0, sy: 0, zoom: 1.2 - 0.12 * e, dzoom: 0.32 * strength * (1 - e), focus: 0.25 };
    case 'orbit': return { sx: Math.cos(e * Math.PI * 1.2) * a * 1.5, sy: Math.sin(e * Math.PI * 1.2) * a * 0.7, zoom: 1.13, dzoom: 0.08, focus: 0.45 };
    case 'pan-right': return { sx: (e - 0.5) * 2 * a, sy: 0, zoom: 1.1, dzoom: 0, focus: 0.4 };
    case 'pan-left': return { sx: (0.5 - e) * 2 * a, sy: 0, zoom: 1.1, dzoom: 0, focus: 0.4 };
    case 'crane-up': return { sx: 0, sy: (e - 0.5) * 1.6 * a, zoom: 1.1 + 0.04 * e, dzoom: 0.05, focus: 0.35 };
    case 'vertigo': return { sx: 0, sy: 0, zoom: 1.08 + 0.18 * e, dzoom: -0.35 * strength * e, focus: 0.55 };
    case 'float': return { sx: Math.sin(t * Math.PI * 2) * a * 0.5, sy: Math.cos(t * Math.PI * 2) * a * 0.3, zoom: 1.09 + 0.03 * e, dzoom: 0.04, focus: 0.45 };
    case 'dolly-in':
    default: return { sx: 0, sy: 0, zoom: 1.06 + 0.12 * e, dzoom: 0.32 * strength * e, focus: 0.25 };
  }
}

export function pickMotion(motion: MotionId, index: number): Exclude<MotionId, 'auto'> {
  if (motion !== 'auto') return motion;
  const list: Exclude<MotionId, 'auto'>[] = ['dolly-in', 'orbit', 'pan-right', 'crane-up', 'vertigo', 'pan-left', 'float', 'dolly-out'];
  return list[index % list.length];
}

/* =========================================================
   Effets 2D (particules, lumières)
   ========================================================= */
interface Particle { x: number; y: number; vx: number; vy: number; r: number; a: number; ph: number }

export class Effects {
  private parts: Particle[] = [];
  constructor(private kind: EffectId, private W: number, private H: number) {
    const n = { none: 0, sparkles: 70, bokeh: 26, snow: 140, rain: 220, lightleak: 0, fog: 0, embers: 80, petals: 34 }[kind];
    for (let i = 0; i < n; i++) this.parts.push(this.spawn(true));
  }
  private spawn(anywhere: boolean): Particle {
    const { W, H, kind } = this;
    const r = Math.random;
    const base = { x: r() * W, y: anywhere ? r() * H : -20, ph: r() * Math.PI * 2, a: 0.4 + r() * 0.6 };
    switch (kind) {
      case 'snow': return { ...base, vx: (r() - 0.5) * 20, vy: 30 + r() * 60, r: 1.5 + r() * 3.5 };
      case 'rain': return { ...base, vx: -60, vy: 900 + r() * 500, r: 1 + r() };
      case 'embers': return { ...base, y: anywhere ? r() * H : H + 20, vx: (r() - 0.5) * 30, vy: -(40 + r() * 80), r: 1 + r() * 2.5 };
      case 'petals': return { ...base, vx: 20 + r() * 40, vy: 40 + r() * 50, r: 5 + r() * 7 };
      case 'bokeh': return { ...base, vx: (r() - 0.5) * 12, vy: (r() - 0.5) * 12, r: 12 + r() * 40, a: 0.08 + r() * 0.18 };
      default: return { ...base, vx: (r() - 0.5) * 10, vy: (r() - 0.5) * 10, r: 1 + r() * 2.2 };
    }
  }
  draw(ctx: CanvasRenderingContext2D, dt: number, time: number) {
    const { W, H, kind } = this;
    if (kind === 'lightleak') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const x = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.6)));
      const g = ctx.createRadialGradient(x, H * 0.2, 0, x, H * 0.2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,170,200,0.45)');
      g.addColorStop(0.4, 'rgba(255,200,150,0.18)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    if (kind === 'fog') {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const x = ((time * (12 + i * 8) + i * W * 0.4) % (W * 1.6)) - W * 0.3;
        const g = ctx.createRadialGradient(x, H * (0.55 + i * 0.12), 0, x, H * (0.55 + i * 0.12), W * 0.7);
        g.addColorStop(0, 'rgba(240,225,235,0.22)');
        g.addColorStop(1, 'rgba(240,225,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      return;
    }
    ctx.save();
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.x += p.vx * dt + (kind === 'snow' || kind === 'petals' ? Math.sin(time * 1.5 + p.ph) * 0.6 : 0);
      p.y += p.vy * dt;
      if (p.y > H + 30 || p.y < -40 || p.x < -40 || p.x > W + 40) {
        if (kind === 'sparkles' || kind === 'bokeh') { p.x = (p.x + W) % W; p.y = (p.y + H) % H; } else this.parts[i] = this.spawn(false);
      }
      const tw = kind === 'sparkles' ? 0.5 + 0.5 * Math.sin(time * 4 + p.ph) : 1;
      ctx.globalAlpha = p.a * tw;
      switch (kind) {
        case 'rain':
          ctx.strokeStyle = 'rgba(210,225,255,0.55)';
          ctx.lineWidth = p.r;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02); ctx.stroke();
          break;
        case 'bokeh': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, 'rgba(255,200,225,0.9)');
          g.addColorStop(1, 'rgba(255,200,225,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'petals':
          ctx.fillStyle = 'rgba(255,170,205,0.85)';
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(time * 1.2 + p.ph);
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          break;
        case 'embers':
          ctx.fillStyle = 'rgba(255,160,80,0.95)';
          ctx.shadowColor = 'rgba(255,120,40,0.9)'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          break;
        case 'sparkles': {
          ctx.fillStyle = '#fff';
          const s = p.r * 2.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + p.r * 0.5, p.y); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - p.r * 0.5, p.y); ctx.closePath();
          ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x, p.y + p.r * 0.5); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y - p.r * 0.5); ctx.closePath();
          ctx.fill();
          break;
        }
        default:
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* =========================================================
   Sous-titres
   ========================================================= */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, W: number, H: number, alpha: number) {
  if (!text || alpha <= 0) return;
  const fs = Math.round(Math.min(W, H) * 0.045);
  ctx.save();
  ctx.font = `600 ${fs}px "DM Sans", system-ui, sans-serif`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > W * 0.8 && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  const lh = fs * 1.3;
  const boxH = shown.length * lh + fs * 1.2;
  const y = H - boxH - H * 0.07;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(28,12,26,0.72)';
  const x = W * 0.06, w = W * 0.88, r = fs * 0.6;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + boxH, r); ctx.arcTo(x + w, y + boxH, x, y + boxH, r); ctx.arcTo(x, y + boxH, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
  ctx.fillStyle = '#fff4fa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  shown.forEach((l, i) => ctx.fillText(l, W / 2, y + fs * 0.6 + i * lh));
  ctx.restore();
}

/* =========================================================
   Enregistrement d’un clip
   ========================================================= */
export function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? null;
}

export interface ClipOptions {
  format: Format;
  seconds: number;
  motion: Exclude<MotionId, 'auto'>;
  effect: EffectId;
  strength?: number;
  caption?: string;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

/** Rend un clip : l’image s’anime en 3D. Durée réelle = durée de la vidéo (enregistrement en temps réel). */
export async function renderMotionClip(image: Blob, depth: DepthMap, opts: ClipOptions): Promise<Blob> {
  const mime = pickMime();
  if (!mime) throw new Error('Ce navigateur ne peut pas enregistrer de vidéo (MediaRecorder). Sur iPhone, utilise Safari à jour.');
  const [W, H] = FORMAT_SIZE[opts.format];
  const bmp = await createImageBitmap(image);
  const gl = new ParallaxRenderer(W, H);
  gl.setScene(bmp, prepareDepth(depth));
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  const fx = new Effects(opts.effect, W, H);
  const stream = out.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise<void>(r => (rec.onstop = () => r()));
  const total = opts.seconds;
  // Première image avant de démarrer l’enregistrement (évite une image noire au début).
  gl.render(cameraAt(opts.motion, 0, opts.strength));
  ctx.drawImage(gl.canvas, 0, 0);
  rec.start(250);
  const t0 = performance.now();
  let last = t0;
  await new Promise<void>((resolve, reject) => {
    const frame = (now: number) => {
      if (opts.signal?.aborted) { rec.stop(); reject(new DOMException('Arrêté', 'AbortError')); return; }
      const t = (now - t0) / 1000;
      if (t >= total) { resolve(); return; }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      gl.render(cameraAt(opts.motion, t / total, opts.strength));
      ctx.globalAlpha = 1;
      ctx.drawImage(gl.canvas, 0, 0);
      fx.draw(ctx, dt, t);
      // Fondu d’entrée et de sortie.
      const fade = Math.min(1, t / 0.4, (total - t) / 0.4);
      if (fade < 1) { ctx.fillStyle = `rgba(10,4,10,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
      if (opts.caption) drawCaption(ctx, opts.caption, W, H, Math.min(1, (t - 0.3) / 0.5, (total - t) / 0.5));
      opts.onProgress?.(t / total);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  bmp.close();
  return new Blob(chunks, { type: mime.split(';')[0] });
}
