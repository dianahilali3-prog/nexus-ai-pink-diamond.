import type { Attachment } from './types';
import { uid } from './storage';

export const DOC_ACCEPT = '.pdf,.txt,.md,.markdown,.csv,.json,.html,.htm,.docx,.rtf,.xml,.log,.srt,.vtt,text/*,application/pdf';
export const IMG_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_FILE = 25 * 1024 * 1024;

async function pdfText(file: File, onProgress?: (p: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 300);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join('');
    pages.push(`[Page ${i}]\n${text.trim()}`);
    onProgress?.(i / max);
  }
  if (doc.numPages > max) pages.push(`[… ${doc.numPages - max} pages non lues]`);
  const all = pages.join('\n\n');
  if (all.replace(/\[Page \d+]/g, '').trim().length < 20) {
    throw new Error('Ce PDF ne contient pas de texte sélectionnable (document scanné). La reconnaissance de texte (OCR) n’est pas incluse.');
  }
  return all;
}

async function docxText(file: File) {
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return r.value;
}

function htmlToText(html: string) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  return d.body?.innerText || d.body?.textContent || '';
}

export async function readDocument(file: File, onProgress?: (p: number) => void): Promise<Attachment> {
  if (file.size > MAX_FILE) throw new Error(`« ${file.name} » dépasse 25 Mo.`);
  const name = file.name.toLowerCase();
  let text: string;
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfText(file, onProgress);
  else if (name.endsWith('.docx')) text = await docxText(file);
  else if (name.endsWith('.doc')) throw new Error('Le format .doc ancien n’est pas lu. Enregistre le fichier en .docx ou .pdf.');
  else if (/\.html?$/.test(name)) text = htmlToText(await file.text());
  else text = await file.text();
  text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error(`« ${file.name} » ne contient pas de texte lisible.`);
  return { id: uid(), name: file.name, kind: 'document', text, chars: text.length };
}

/** Réduit une image (max 1024 px) pour l’envoyer à un modèle « vision » ou la décrire localement. */
export async function readImage(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE) throw new Error(`« ${file.name} » dépasse 25 Mo.`);
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  return { id: uid(), name: file.name, kind: 'image', text: '', dataUrl, chars: 0 };
}

/* ---------- Recherche de passages pertinents (sans serveur) ---------- */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokenize = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2);

export function chunkText(text: string, size = 1400, overlap = 200) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) chunks.push(text.slice(i, i + size));
  return chunks;
}

/** Sélectionne les passages les plus proches de la question (BM25 simplifié). */
export function relevantPassages(docs: Attachment[], question: string, budget = 14000): string {
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  if (total <= budget) return docs.map(d => `### Document : ${d.name}\n${d.text}`).join('\n\n');
  const all = docs.flatMap(d => chunkText(d.text).map((c, i) => ({ doc: d.name, i, c, toks: tokenize(c) })));
  const q = [...new Set(tokenize(question))];
  const N = all.length;
  const avg = all.reduce((n, x) => n + x.toks.length, 0) / Math.max(1, N);
  const df = new Map(q.map(t => [t, all.filter(x => x.toks.includes(t)).length]));
  const scored = all.map(x => {
    let s = 0;
    for (const t of q) {
      const f = x.toks.filter(w => w === t).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
      s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (x.toks.length / avg))));
    }
    return { ...x, s: s + (x.i === 0 ? 0.3 : 0) }; // léger bonus au début (résumé, titre)
  });
  const picked: typeof scored = [];
  let used = 0;
  for (const x of scored.sort((a, b) => b.s - a.s)) {
    if (used + x.c.length > budget) break;
    picked.push(x);
    used += x.c.length;
  }
  picked.sort((a, b) => (a.doc === b.doc ? a.i - b.i : a.doc.localeCompare(b.doc)));
  return `(Extraits les plus pertinents, ${picked.length}/${N} passages)\n\n` + picked.map(x => `### ${x.doc} — passage ${x.i + 1}\n${x.c}`).join('\n\n');
}
