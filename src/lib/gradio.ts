// Client minimal pour les espaces Hugging Face (Gradio 4/5, protocole de file d’attente).
export interface GradioStatus {
  stage: 'queue' | 'running' | 'progress';
  text: string;
}

export class GradioError extends Error {
  constructor(message: string, public quota = false) {
    super(message);
  }
}

const configCache = new Map<string, Promise<{ fn: number; prefix: string }>>();

async function resolveFn(space: string, apiName: string, headers: Record<string, string>) {
  const key = `${space}#${apiName}`;
  if (!configCache.has(key)) {
    configCache.set(
      key,
      (async () => {
        const res = await fetch(`${space}/config`, { headers });
        if (!res.ok) throw new GradioError(`Espace indisponible (${res.status}). Il est peut-être en veille ou supprimé.`);
        const cfg = await res.json();
        const dep = (cfg.dependencies as { id: number; api_name?: string }[]).find(d => d.api_name === apiName);
        if (!dep) throw new GradioError(`L’espace a changé : la fonction « ${apiName} » n’existe plus.`);
        return { fn: dep.id, prefix: cfg.api_prefix || '/gradio_api' };
      })().catch(e => { configCache.delete(key); throw e; })
    );
  }
  return configCache.get(key)!;
}

export async function callSpace(
  space: string,
  apiName: string,
  data: unknown[],
  opts: { token?: string; signal?: AbortSignal; onStatus?: (s: GradioStatus) => void; timeoutMs?: number } = {}
): Promise<unknown[]> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const { fn, prefix } = await resolveFn(space, apiName, headers);
  const session = Math.random().toString(36).slice(2, 12);
  const join = await fetch(`${space}${prefix}/queue/join`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, fn_index: fn, session_hash: session, event_data: null, trigger_id: null }),
    signal: opts.signal
  });
  if (!join.ok) throw new GradioError(join.status === 429 ? 'File d’attente pleine, réessaie plus tard.' : `Espace : erreur ${join.status}.`);

  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  opts.signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(`${space}${prefix}/queue/data?session_hash=${session}`, { headers, signal: ctrl.signal });
    if (!res.ok || !res.body) throw new GradioError(`Espace : flux indisponible (${res.status}).`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        let m: any;
        try { m = JSON.parse(line.slice(5)); } catch { continue; }
        if (m.msg === 'estimation') {
          opts.onStatus?.({ stage: 'queue', text: m.rank > 0 ? `File d’attente : position ${m.rank + 1}/${m.queue_size}${m.rank_eta ? ` (~${Math.round(m.rank_eta)} s)` : ''}` : 'Démarrage…' });
        } else if (m.msg === 'process_starts') {
          opts.onStatus?.({ stage: 'running', text: 'Génération en cours sur GPU…' });
        } else if (m.msg === 'progress' && m.progress_data?.[0]) {
          const p = m.progress_data[0];
          opts.onStatus?.({ stage: 'progress', text: p.length ? `Étape ${p.index}/${p.length}` : 'Calcul…' });
        } else if (m.msg === 'process_completed') {
          if (m.success && m.output?.data) return m.output.data as unknown[];
          const err: string = m.output?.error || m.title || 'Échec de la génération.';
          const quota = /quota/i.test(err) || /quota/i.test(m.title ?? '');
          throw new GradioError(
            quota
              ? 'Quota GPU gratuit de Hugging Face épuisé pour aujourd’hui. Ajoute un jeton Hugging Face gratuit dans Réglages (plus de quota) ou réessaie plus tard.'
              : `Espace : ${String(err).slice(0, 200)}`,
            quota
          );
        }
      }
    }
    throw new GradioError('Connexion à l’espace interrompue.');
  } catch (e) {
    if (ctrl.signal.aborted && !opts.signal?.aborted) throw new GradioError('Délai dépassé : l’espace met trop de temps à répondre.');
    throw e;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', stop);
  }
}

/** Télécharge un fichier renvoyé par un espace (objet { url } ou { video: { url } }). */
export async function fetchSpaceFile(file: unknown, token?: string): Promise<Blob> {
  const f = file as { url?: string; path?: string; video?: { url?: string } };
  const url = f?.url ?? f?.video?.url;
  if (!url) throw new GradioError('L’espace n’a renvoyé aucun fichier.');
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new GradioError(`Téléchargement du résultat impossible (${res.status}).`);
  return res.blob();
}

/** Envoie un fichier (image) à un espace et renvoie la référence attendue par Gradio. */
export async function uploadToSpace(space: string, blob: Blob, name: string, token?: string) {
  const form = new FormData();
  form.append('files', blob, name);
  const res = await fetch(`${space}/gradio_api/upload`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new GradioError(`Envoi de l’image à l’espace impossible (${res.status}).`);
  const [path] = (await res.json()) as string[];
  return { path, orig_name: name, mime_type: blob.type || 'image/png', meta: { _type: 'gradio.FileData' } };
}
