import { getSettings } from './settings';
import type { Source } from './types';

export interface WebContext {
  text: string;
  sources: Source[];
  notes: string[];
}

const timeout = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

const STOP = new Set('le la les un une des de du d l et ou en au aux à a est sont que qui quoi quel quelle quels quelles comment pourquoi combien où ce cet cette ces mon ma mes ton ta tes son sa ses pour par sur dans avec sans je tu il elle on nous vous ils elles me te se y ne pas plus moins très peux peut fais faire dis dire donne explique cherche trouve moi stp svp merci the of and to in is what how why'.split(' '));

/** Réduit une question à des mots-clés pour la recherche encyclopédique. */
export function keywords(q: string) {
  return q
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/[\s']+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .slice(0, 8)
    .join(' ');
}

/** Recherche Wikipédia (API ouverte, CORS autorisé) avec extraits. */
export async function searchWikipedia(query: string, lang = getSettings().web.wikiLang): Promise<{ title: string; url: string; extract: string }[]> {
  const q = keywords(query) || query;
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=4&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=1400&format=json&origin=*`;
  const res = await fetch(url, { signal: timeout(15000), headers: { 'Api-User-Agent': 'NEXUS-AI-PWA/1.0 (github.io)' } });
  if (!res.ok) throw new Error(`Wikipédia : erreur ${res.status}`);
  const j = await res.json();
  const pages = Object.values(j?.query?.pages ?? {}) as { title: string; fullurl: string; extract?: string; index: number }[];
  return pages.sort((a, b) => a.index - b.index).map(p => ({ title: p.title, url: p.fullurl, extract: (p.extract ?? '').trim() })).filter(p => p.extract);
}

/** Recherche via une instance SearXNG personnelle (format JSON + CORS requis). */
export async function searchSearx(query: string, base: string) {
  const res = await fetch(`${base.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json&language=fr`, { signal: timeout(15000) });
  if (!res.ok) throw new Error(`SearXNG : erreur ${res.status}`);
  const j = await res.json();
  return ((j.results ?? []) as { title: string; url: string; content?: string }[]).slice(0, 6).map(r => ({ title: r.title, url: r.url, extract: r.content ?? '' }));
}

/** Lit une page web en texte via Jina Reader (gratuit sans clé, ~20 requêtes/minute). */
export async function readUrl(url: string, maxChars = 9000): Promise<{ title: string; text: string }> {
  const res = await fetch(`https://r.jina.ai/${url}`, { signal: timeout(45000) });
  if (res.status === 429) throw new Error('Lecture de page : limite gratuite atteinte (20/minute), réessaie dans une minute.');
  if (!res.ok) throw new Error(`Lecture de page impossible (${res.status}).`);
  const raw = await res.text();
  const title = /^Title:\s*(.+)$/m.exec(raw)?.[1]?.trim() || url;
  const body = raw.split(/Markdown Content:\s*/)[1] ?? raw;
  return { title, text: body.replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars) };
}

export const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/** Rassemble un contexte web pour une question (Wikipédia, SearXNG, liens cités). */
export async function gatherWebContext(question: string, opts: { search: boolean }): Promise<WebContext> {
  const s = getSettings();
  const ctx: WebContext = { text: '', sources: [], notes: [] };
  const parts: string[] = [];
  const links = s.web.readLinks ? [...new Set(question.match(URL_RE) ?? [])].slice(0, 2) : [];
  await Promise.all(
    links.map(async link => {
      try {
        const page = await readUrl(link);
        parts.push(`### Page lue : ${page.title}\nURL : ${link}\n${page.text}`);
        ctx.sources.push({ title: page.title, url: link });
      } catch (e) {
        ctx.notes.push(e instanceof Error ? e.message : 'Lecture de page impossible.');
      }
    })
  );
  if (opts.search) {
    try {
      const results = s.web.searxUrl ? await searchSearx(question, s.web.searxUrl) : await searchWikipedia(question);
      if (!results.length) ctx.notes.push('Recherche : aucun résultat trouvé.');
      results.forEach((r, i) => {
        parts.push(`### [${i + 1 + ctx.sources.length}] ${r.title}\nURL : ${r.url}\n${r.extract}`);
      });
      ctx.sources.push(...results.map(r => ({ title: r.title, url: r.url })));
    } catch (e) {
      ctx.notes.push(e instanceof Error ? e.message : 'Recherche indisponible.');
    }
  }
  ctx.text = parts.join('\n\n');
  return ctx;
}
