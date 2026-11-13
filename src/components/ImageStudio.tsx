import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Dices, Download, Eye, ImagePlus, Loader2, RefreshCw, Share2, Sparkles, Square, Wand2 } from 'lucide-react';
import { readImage } from '../lib/documents';
import { downloadBlob, enhancePrompt, extFor, generateImage, shareBlob, SIZES, STYLES } from '../lib/images';
import { getSettings, setSettings, useSettings, type ImageEngine } from '../lib/settings';
import { addToGallery } from '../lib/storage';
import { AiDisclaimer, copyText, takeIntent, toast, useObjectUrl } from './ui';

interface Result { id: string; blob: Blob; prompt: string; engine: string; seed: number }

const ENGINES: { id: ImageEngine; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Pollinations, puis FLUX en secours' },
  { id: 'pollinations', label: 'Pollinations', hint: 'Gratuit, sans clé' },
  { id: 'flux-space', label: 'FLUX (HF)', hint: 'Quota GPU quotidien' },
  { id: 'pollinations-key', label: 'Pollinations+', hint: 'Avec ta clé' }
];

export default function ImageStudio() {
  const settings = useSettings();
  const [idea, setIdea] = useState('');
  const [style, setStyle] = useState('none');
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [describe, setDescribe] = useState<{ url: string; text: string; busy: boolean } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const i = takeIntent('image');
    if (i) setIdea(i.prompt);
    return () => ctrl.current?.abort();
  }, []);

  const size = SIZES[settings.image.size];
  const styleSuffix = STYLES.find(s => s.id === style)?.suffix ?? '';

  const improve = async () => {
    if (!idea.trim()) { toast('Écris d’abord une idée.', 'info'); return; }
    setEnhancing(true);
    try {
      setIdea(await enhancePrompt(idea, STYLES.find(s => s.id === style)?.label));
      toast('Prompt amélioré par NEXUS.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Amélioration impossible.', 'error', 6000);
    } finally {
      setEnhancing(false);
    }
  };

  const generate = async (overrideSeed?: number, overridePrompt?: string) => {
    const base = (overridePrompt ?? idea).trim();
    if (!base) { toast('Décris l’image que tu imagines.', 'info'); return; }
    ctrl.current = new AbortController();
    setBusy(true);
    try {
      let prompt = base;
      if (getSettings().image.autoEnhance && !overridePrompt && base.split(/\s+/).length < 25) {
        setStatus('NEXUS enrichit ton idée…');
        try { prompt = await enhancePrompt(base, STYLES.find(s => s.id === style)?.label, ctrl.current.signal); } catch { /* idée brute */ }
      }
      const full = `${prompt}${styleSuffix}`;
      const n = overrideSeed !== undefined ? 1 : count;
      for (let k = 0; k < n; k++) {
        const sd = overrideSeed ?? (seed ? Number(seed) + k : undefined);
        setStatus(n > 1 ? `Image ${k + 1}/${n}…` : 'Création…');
        const r = await generateImage(full, { width: size.w, height: size.h, seed: sd, signal: ctrl.current.signal, onStatus: t => setStatus(n > 1 ? `Image ${k + 1}/${n} — ${t}` : t) });
        const item = await addToGallery(r.blob, { kind: 'image', prompt: full, source: r.engine, width: r.width, height: r.height });
        setResults(prev => [{ id: item.id, blob: r.blob, prompt: full, engine: r.engine, seed: r.seed }, ...prev].slice(0, 12));
      }
      toast(n > 1 ? `${n} images créées et enregistrées dans ta galerie.` : 'Image créée et enregistrée dans ta galerie.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast(e instanceof Error ? e.message.split('\n').join(' · ') : 'Échec.', 'error', 9000);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const describeImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const att = await readImage(file);
      setDescribe({ url: att.dataUrl!, text: '', busy: true });
      const { captionLocal } = await import('../lib/localllm');
      const raw = await captionLocal(att.dataUrl!, p => p.file && setDescribe(d => d && { ...d, text: `Téléchargement du modèle de description (une seule fois)… ${Math.round(p.progress)} %` }));
      let text = raw;
      try {
        const { quickChat } = await import('../lib/providers');
        text = (await quickChat([
          { role: 'system', content: 'Traduis en français naturel cette description d’image, en une phrase. Réponds uniquement par la traduction.' },
          { role: 'user', content: raw }
        ])).text || raw;
      } catch { /* garde l’anglais */ }
      setDescribe({ url: att.dataUrl!, text, busy: false });
    } catch (e) {
      setDescribe(d => d && { ...d, busy: false, text: e instanceof Error ? e.message : 'Description impossible.' });
    }
  };

  return (
    <div className="studio-layout">
      <section className="panel generator-panel">
        <div className="panel-title">
          <span className="large-icon"><Wand2 size={21} /></span>
          <div><h2>Studio Image</h2><p>Décris ton idée, NEXUS s’occupe du reste.</p></div>
        </div>

        <label className="field-label" htmlFor="img-prompt">Ton idée</label>
        <textarea id="img-prompt" className="prompt-area" value={idea} onChange={e => setIdea(e.target.value)} rows={4}
          placeholder="Ex. : un flacon de parfum en cristal rose posé sur du marbre, pétales de rose, lumière douce du matin" />
        <div className="inline-actions">
          <button className="ghost-button" onClick={improve} disabled={enhancing || busy}>{enhancing ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Améliorer mon prompt</button>
          <button className="ghost-button" onClick={() => copyText(idea)} disabled={!idea}><Copy size={15} /> Copier</button>
        </div>

        <span className="field-label">Style</span>
        <div className="chip-select" role="radiogroup" aria-label="Style">
          {STYLES.map(s => <button key={s.id} role="radio" aria-checked={style === s.id} className={style === s.id ? 'on' : ''} onClick={() => setStyle(s.id)}>{s.label}</button>)}
        </div>

        <span className="field-label">Format</span>
        <div className="chip-select" role="radiogroup" aria-label="Format">
          {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map(k => (
            <button key={k} role="radio" aria-checked={settings.image.size === k} className={settings.image.size === k ? 'on' : ''} onClick={() => setSettings(s => ({ ...s, image: { ...s.image, size: k } }))}>
              {SIZES[k].label} <small>{SIZES[k].w}×{SIZES[k].h}</small>
            </button>
          ))}
        </div>

        <div className="two-cols">
          <div>
            <label className="field-label" htmlFor="img-engine">Moteur</label>
            <select id="img-engine" className="settings-input" value={settings.image.engine} onChange={e => setSettings(s => ({ ...s, image: { ...s.image, engine: e.target.value as ImageEngine } }))}>
              {ENGINES.map(e => <option key={e.id} value={e.id}>{e.label} — {e.hint}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="img-count">Nombre</label>
            <select id="img-count" className="settings-input" value={count} onChange={e => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} image{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>
        <details className="more">
          <summary>Options avancées</summary>
          <label className="field-label" htmlFor="img-seed">Graine (pour reproduire une image)</label>
          <div className="input-with-button">
            <input id="img-seed" className="settings-input" inputMode="numeric" value={seed} onChange={e => setSeed(e.target.value.replace(/\D/g, ''))} placeholder="Aléatoire" />
            <button className="icon-button" onClick={() => setSeed(String(Math.floor(Math.random() * 1e9)))} aria-label="Graine aléatoire"><Dices size={16} /></button>
          </div>
          <label className="toggle-inline"><input type="checkbox" checked={settings.image.autoEnhance} onChange={e => setSettings(s => ({ ...s, image: { ...s.image, autoEnhance: e.target.checked } }))} /> Enrichir automatiquement les idées courtes</label>
        </details>

        {busy ? (
          <button className="primary-button full stop" onClick={() => ctrl.current?.abort()}><Square size={16} /> Arrêter</button>
        ) : (
          <button className="primary-button full glow" onClick={() => generate()}><ImagePlus size={17} /> Créer {count > 1 ? `${count} images` : 'l’image'}</button>
        )}
        {status && <p className="status-line"><Loader2 size={14} className="spin" /> {status}</p>}
        <p className="disclaimer">Images créées par des modèles open source via Pollinations ou Hugging Face. Comptent 10 à 60 s. N’utilise pas de photos de vraies personnes sans leur accord.</p>

        <div className="divider" />
        <div className="panel-title small">
          <span className="large-icon"><Eye size={18} /></span>
          <div><h3>Décrire une image</h3><p>Analyse faite sur ton appareil (modèle open source).</p></div>
        </div>
        <button className="secondary-button full" onClick={() => descRef.current?.click()}>Choisir une image à décrire</button>
        <input ref={descRef} type="file" accept="image/*" hidden onChange={e => { void describeImage(e.target.files?.[0]); e.target.value = ''; }} />
        {describe && (
          <div className="describe-box">
            <img src={describe.url} alt="Image à décrire" />
            <p>{describe.busy && <Loader2 size={14} className="spin" />} {describe.text || 'Analyse…'}</p>
          </div>
        )}
      </section>

      <section className="panel queue-panel">
        <div className="queue-heading">
          <div><span className="eyebrow">Résultats</span><h3>Tes créations</h3></div>
          <span className="count-badge">{results.length}</span>
        </div>
        {busy && results.length === 0 && <div className="img-skeleton big"><span>{status || 'Création…'}</span></div>}
        {results.length === 0 && !busy ? (
          <div className="empty-state"><span className="empty-icon"><ImagePlus size={26} /></span><b>Ton studio est prêt</b><p>Tes images apparaîtront ici et dans ta galerie.</p></div>
        ) : (
          <div className="result-grid">
            {results.map(r => <ResultCard key={r.id} r={r} onVariant={() => generate(undefined, r.prompt)} onSame={() => generate(r.seed, r.prompt)} />)}
          </div>
        )}
        <AiDisclaimer compact />
      </section>
    </div>
  );
}

function ResultCard({ r, onVariant, onSame }: { r: Result; onVariant: () => void; onSame: () => void }) {
  const url = useObjectUrl(r.blob);
  const name = `nexus-image-${r.seed}.${extFor(r.blob.type)}`;
  return (
    <motion.figure className="result-card" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      {url && <img src={url} alt={r.prompt} loading="lazy" />}
      <figcaption>
        <small>{r.engine} · graine {r.seed}</small>
        <div className="card-actions">
          <button onClick={() => downloadBlob(r.blob, name)} aria-label="Télécharger l’image"><Download size={15} /></button>
          <button onClick={async () => { if (!(await shareBlob(r.blob, name, r.prompt))) toast('Partage non disponible ici : utilise Télécharger.', 'info'); }} aria-label="Partager"><Share2 size={15} /></button>
          <button onClick={onVariant} aria-label="Créer une variante"><RefreshCw size={15} /></button>
          <button onClick={onSame} aria-label="Recréer avec la même graine"><Dices size={15} /></button>
          <button onClick={() => copyText(r.prompt)} aria-label="Copier le prompt"><Copy size={15} /></button>
        </div>
      </figcaption>
    </motion.figure>
  );
}
