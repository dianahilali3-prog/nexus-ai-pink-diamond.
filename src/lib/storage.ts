import { createStore, del, entries, get, set, clear, keys } from 'idb-keyval';
import type { Conversation, GalleryItem, MemoryItem } from './types';

// Trois bases IndexedDB locales : rien n'est envoyé sur un serveur NEXUS.
const convStore = createStore('nexus-conversations', 'kv');
const galleryMeta = createStore('nexus-gallery-meta', 'kv');
const galleryBlobs = createStore('nexus-gallery-blobs', 'kv');
const memoryStore = createStore('nexus-memory', 'kv');

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/* ---------- Conversations ---------- */
export async function listConversations(): Promise<Conversation[]> {
  const all = await entries<string, Conversation>(convStore);
  return all.map(([, c]) => c).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveConversation = (c: Conversation) => set(c.id, c, convStore);
export const deleteConversation = (id: string) => del(id, convStore);

/* ---------- Galerie ---------- */
export async function addToGallery(blob: Blob, meta: Omit<GalleryItem, 'id' | 'createdAt' | 'mime'>): Promise<GalleryItem> {
  const item: GalleryItem = { ...meta, id: uid(), createdAt: Date.now(), mime: blob.type || (meta.kind === 'video' ? 'video/webm' : 'image/jpeg') };
  await set(item.id, blob, galleryBlobs);
  await set(item.id, item, galleryMeta);
  window.dispatchEvent(new Event('nexus-gallery'));
  return item;
}
export async function listGallery(): Promise<GalleryItem[]> {
  const all = await entries<string, GalleryItem>(galleryMeta);
  return all.map(([, g]) => g).sort((a, b) => b.createdAt - a.createdAt);
}
export const getGalleryBlob = (id: string) => get<Blob>(id, galleryBlobs);
export const getGalleryItem = (id: string) => get<GalleryItem>(id, galleryMeta);
export async function deleteGalleryItem(id: string) {
  await del(id, galleryBlobs);
  await del(id, galleryMeta);
  window.dispatchEvent(new Event('nexus-gallery'));
}
export async function galleryCount() {
  return (await keys(galleryMeta)).length;
}

/* ---------- Mémoire (apprentissage local) ---------- */
export async function listMemory(): Promise<MemoryItem[]> {
  const all = await entries<string, MemoryItem>(memoryStore);
  return all.map(([, m]) => m).sort((a, b) => a.createdAt - b.createdAt);
}
export async function addMemory(kind: MemoryItem['kind'], text: string) {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!clean) return null;
  const existing = await listMemory();
  if (existing.some(m => m.text.toLowerCase() === clean.toLowerCase())) return null;
  // Limite douce : on garde les 60 plus récents.
  if (existing.length >= 60) await del(existing[0].id, memoryStore);
  const item: MemoryItem = { id: uid(), kind, text: clean, createdAt: Date.now() };
  await set(item.id, item, memoryStore);
  window.dispatchEvent(new Event('nexus-memory'));
  return item;
}
export async function deleteMemory(id: string) {
  await del(id, memoryStore);
  window.dispatchEvent(new Event('nexus-memory'));
}

/* ---------- Export / import / effacement ---------- */
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportAll(includeMedia: boolean) {
  const conversations = await listConversations();
  const memory = await listMemory();
  const gallery = await listGallery();
  const media: Record<string, string> = {};
  if (includeMedia) {
    for (const g of gallery) {
      const b = await getGalleryBlob(g.id);
      if (b && b.size < 25_000_000) media[g.id] = await blobToDataUrl(b);
    }
  }
  const settingsRaw = localStorage.getItem('nexus.settings.v1');
  let settings: unknown = null;
  if (settingsRaw) {
    const s = JSON.parse(settingsRaw);
    // Les clés ne sont jamais exportées.
    if (s.keys) s.keys = Object.fromEntries(Object.keys(s.keys).map(k => [k, '']));
    settings = s;
  }
  return { app: 'NEXUS AI', version: 1, exportedAt: new Date().toISOString(), conversations, memory, gallery, media, settings };
}

export async function importAll(data: unknown) {
  if (!data || typeof data !== 'object') throw new Error('Fichier invalide');
  const d = data as { conversations?: Conversation[]; memory?: MemoryItem[]; gallery?: GalleryItem[]; media?: Record<string, string> };
  let n = 0;
  for (const c of d.conversations ?? []) if (c?.id && Array.isArray(c.messages)) { await saveConversation(c); n++; }
  for (const m of d.memory ?? []) if (m?.id && m.text) await set(m.id, m, memoryStore);
  for (const g of d.gallery ?? []) {
    const url = d.media?.[g.id];
    if (!g?.id || !url) continue;
    const blob = await (await fetch(url)).blob();
    await set(g.id, blob, galleryBlobs);
    await set(g.id, g, galleryMeta);
  }
  window.dispatchEvent(new Event('nexus-gallery'));
  window.dispatchEvent(new Event('nexus-memory'));
  return n;
}

export async function wipeEverything() {
  await Promise.all([clear(convStore), clear(galleryMeta), clear(galleryBlobs), clear(memoryStore)]);
  Object.keys(localStorage).filter(k => k.startsWith('nexus.')).forEach(k => localStorage.removeItem(k));
  try {
    for (const k of await caches.keys()) if (k.includes('transformers') || k.includes('nexus')) await caches.delete(k);
  } catch { /* Cache API indisponible */ }
}
