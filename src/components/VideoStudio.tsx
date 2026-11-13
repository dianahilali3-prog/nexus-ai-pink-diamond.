import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clapperboard, Download, FileUp, Film, ImagePlus, Info, Layers3, Loader2, RefreshCw, Sparkles, Square, Trash2, Wand2
} from 'lucide-react';
import { DOC_ACCEPT, readDocument } from '../lib/documents';
import { downloadBlob, enhancePrompt, extFor, generateImage, STYLES } from '../lib/images';
import { useSettings } from '../lib/settings';
import { addToGallery, getGalleryBlob } from '../lib/storage';
import { ltxVideo, makeStoryboard, pollinationsVideo, recorderSupport, renderSlideshow, type Scene } from '../lib/video';
import { AiDisclaimer, Progress, takeIntent, toast, Toggle, useObjectUrl } from './ui';

type Format = 'portrait' | 'landscape' | 'square';
type StoredScene = Omit<Scene, 'image' | 'imageUrl'> & { galleryId?: string };
const DIMS: Record<Format, { w: number; h: number; label: string }> = {
  portrait: { w: 768, h: 1344, label: 'Vertical 9:16 (Reels, TikTok)' },
  landscape: { w: 1344, h: 768, label: 'Horizontal 16:9 (YouTube)' },
  square: { w: 1024, h: 1024, label: 'Carré 1:1 (Instagram)' }
};
const TONES = ['professionnel et clair', 'inspirant et émotionnel', 'pédagogique', 'publicitaire et dynamique', 'luxueux et élégant'];

function loadProject(): { title: string; source: string; scenes: StoredScene[] } {
  try { return JSON.parse(localStorage.getItem('nexus.project') || '') ; } catch { return { title: '', source: '', scenes: [] }; }
}

export default function VideoStudio() {
  const [mode, setMode] = useState<'project' | 'ai'>('project');
  return (
    <div className="video-studio">
      <div className="segmented" role="tablist" aria-label="Mode du studio vidéo">
        <button role="tab" aria-selected={mode === 'project'} className={mode === 'project' ? 'on' : ''} onClick={() => setMode('project')}><Layers3 size={16} /> Projet → images & vidéo</button>
        <button role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}><Sparkles size={16} /> Vidéo IA <span className="nav-tag">BETA</span></button>
      </div>
      {mode === 'project' ? <ProjectStudio /> : <AiVideo />}
    </div>
  );
}

/* =========================================================
   Projet / rapport → storyboard → images → vidéo montée
   ========================================================= */
function ProjectStudio() {
  const saved = loadProject();
  const [source, setSource] = useState(saved.source ?? '');
  const [title, setTitle] = useState(saved.title ?? '');
  const [scenes, setScenes] = useState<Scene[]>((saved.scenes ?? []).map(s => ({ ...s, status: s.galleryId ? 'idle' : s.status === 'done' ? 'idle' : s.status })));
  const [galleryIds, setGalleryIds] = useState<Record<string, string>>(() => Object.fromEntries((saved.scenes ?? []).filter(s => s.galleryId).map(s => [s.id, s.galleryId!])));
  const [count, setCount] = useState(5);
  const [style, setStyle] = useState('cinema');
  const [tone, setTone] = useState(TONES[0]);
  const [format, setFormat] = useState<Format>('portrait');
  const [busy, setBusy] = useState<'' | 'board' | 'images' | 'video'>('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(4);
  const [captions, setCaptions] = useState(true);
  const [narration, setNarration] = useState(false);
  const [video, setVideo] = useState<Blob | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoUrl = useObjectUrl(video);
  const support = recorderSupport();

  // Restaure les images déjà générées depuis la galerie.
  useEffect(() => {
    const i = takeIntent('video');
    if (i) setSource(i.text);
    (async () => {
      const restored = await Promise.all(scenes.map(async s => {
        const gid = galleryIds[s.id];
        if (!gid) return s;
        const b = await getGalleryBlob(gid);
        return b ? { ...s, image: b, status: 'done' as const } : s;
      }));
      setScenes(restored);
    })();
    return () => ctrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stored: StoredScene[] = scenes.map(({ image: _i, imageUrl: _u, ...rest }) => ({ ...rest, galleryId: galleryIds[rest.id] }));
    try { localStorage.setItem('nexus.project', JSON.stringify({ title, source: source.slice(0, 60000), scenes: stored })); } catch { /* plein */ }
  }, [scenes, title, source, galleryIds]);

  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      setStatus(`Lecture de « ${f.name} »…`);
      const doc = await readDocument(f, p => setStatus(`Lecture… ${Math.round(p * 100)} %`));
      setSource(doc.text);
      toast(`« ${f.name} » importé (${doc.chars.toLocaleString('fr-FR')} caractères).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Fichier illisible.', 'error', 7000);
    } finally {
      setStatus('');
    }
  };

  const board = async () => {
    if (source.trim().length < 20) { toast('Colle ou importe d’abord ton rapport, projet ou idée (quelques phrases minimum).', 'info'); return; }
    ctrl.current = new AbortController();
    setBusy('board');
    setStatus('NEXUS lit ton texte et imagine les scènes…');
    try {
      const st = STYLES.find(s => s.id === style);
      const r = await makeStoryboard(source, { scenes: count, style: `${st?.label} style${st?.suffix ?? ''}`, tone, signal: ctrl.current.signal });
      setTitle(r.title);
      setScenes(r.scenes);
      setGalleryIds({});
      setVideo(null);
      toast(`Storyboard prêt : ${r.scenes.length} scènes. Tu peux modifier chaque texte.`);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast(e instanceof Error ? e.message : 'Storyboard impossible.', 'error', 8000);
    } finally {
      setBusy('');
      setStatus('');
    }
  };

  const patch = (id: string, p: Partial<Scene>) => setScenes(list => list.map(s => (s.id === id ? { ...s, ...p } : s)));

  const genOne = async (s: Scene, signal?: AbortSignal) => {
    patch(s.id, { status: 'working', error: undefined });
    try {
      const d = DIMS[format];
      const r = await generateImage(s.imagePrompt, { width: d.w, height: d.h, signal, onStatus: t => setStatus(`${s.title} — ${t}`) });
      const item = await addToGallery(r.blob, { kind: 'image', prompt: s.imagePrompt, source: r.engine, width: r.width, height: r.height });
      setGalleryIds(g => ({ ...g, [s.id]: item.id }));
      patch(s.id, { image: r.blob, status: 'done' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { patch(s.id, { status: 'idle' }); throw e; }
      patch(s.id, { status: 'error', error: e instanceof Error ? e.message.split('\n')[0] : 'Échec' });
    }
  };

  const genAll = async () => {
    ctrl.current = new AbortController();
    setBusy('images');
    const todo = scenes.filter(s => !s.image);
    try {
      for (let i = 0; i < todo.length; i++) {
        setProgress(i / todo.length);
        await genOne(todo[i], ctrl.current.signal);
      }
      setProgress(1);
      toast('Images des scènes créées (aussi dans ta galerie).');
    } catch { /* arrêté */ } finally {
      setBusy('');
      setStatus('');
    }
  };

  const montage = async () => {
    ctrl.current = new AbortController();
    setBusy('video');
    setVideo(null);
    try {
      const blob = await renderSlideshow(scenes, {
        format, secondsPerScene: seconds, title, showCaptions: captions, narration, signal: ctrl.current.signal,
        onProgress: (r, t) => { setProgress(r); setStatus(t); }
      });
      setVideo(blob);
      await addToGallery(blob, { kind: 'video', prompt: title || 'Montage NEXUS', source: 'Montage NEXUS (navigateur)' });
      toast('Vidéo prête et enregistrée dans ta galerie.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast(e instanceof Error ? e.message : 'Montage impossible.', 'error', 8000);
    } finally {
      setBusy('');
      setStatus('');
    }
  };

  const ready = scenes.filter(s => s.image).length;

  return (
    <div className="studio-layout">
      <section className="panel generator-panel">
        <div className="panel-title">
          <span className="large-icon"><Clapperboard size={21} /></span>
          <div><h2>Du texte à la vidéo</h2><p>Rapport, projet, article ou simple idée → storyboard → images → vidéo.</p></div>
        </div>
        <label className="field-label" htmlFor="src">Ton rapport ou projet</label>
        <textarea id="src" className="prompt-area batch-area" rows={7} value={source} onChange={e => setSource(e.target.value)}
          placeholder="Colle ici ton texte (ou importe un PDF / Word / TXT). Ex. : « Rapport annuel de la boutique : hausse de 20 % des ventes, ouverture d’un 2ᵉ atelier… »" />
        <div className="inline-actions">
          <button className="ghost-button" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Importer un fichier</button>
          {source && <small className="muted-text">{source.length.toLocaleString('fr-FR')} caractères</small>}
        </div>
        <input ref={fileRef} type="file" accept={DOC_ACCEPT} hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="two-cols">
          <div>
            <label className="field-label" htmlFor="n">Scènes</label>
            <select id="n" className="settings-input" value={count} onChange={e => setCount(Number(e.target.value))}>{[3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div>
            <label className="field-label" htmlFor="fmt">Format</label>
            <select id="fmt" className="settings-input" value={format} onChange={e => setFormat(e.target.value as Format)}>{(Object.keys(DIMS) as Format[]).map(f => <option key={f} value={f}>{DIMS[f].label}</option>)}</select>
          </div>
          <div>
            <label className="field-label" htmlFor="sty">Style visuel</label>
            <select id="sty" className="settings-input" value={style} onChange={e => setStyle(e.target.value)}>{STYLES.filter(s => s.id !== 'logo').map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </div>
          <div>
            <label className="field-label" htmlFor="tone">Ton</label>
            <select id="tone" className="settings-input" value={tone} onChange={e => setTone(e.target.value)}>{TONES.map(t => <option key={t} value={t}>{t}</option>)}</select>
          </div>
        </div>

        {busy === 'board' ? (
          <button className="primary-button full stop" onClick={() => ctrl.current?.abort()}><Square size={16} /> Arrêter</button>
        ) : (
          <button className="primary-button full glow" onClick={board} disabled={!!busy}><Wand2 size={17} /> {scenes.length ? 'Refaire le storyboard' : 'Créer le storyboard'}</button>
        )}
        {status && busy !== 'video' && <p className="status-line"><Loader2 size={14} className="spin" /> {status}</p>}
        <AiDisclaimer compact />
      </section>

      <section className="panel queue-panel">
        <div className="queue-heading">
          <div><span className="eyebrow">Storyboard</span><h3>{title || 'Scènes'}</h3></div>
          <span className="count-badge">{ready}/{scenes.length}</span>
        </div>
        {scenes.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Film size={26} /></span><b>Ton prochain film commence ici</b><p>Le storyboard apparaîtra ici : une image par scène, avec texte à l’écran et voix off.</p></div>
        ) : (
          <>
            <div className="scene-list">
              {scenes.map((s, i) => <SceneCard key={s.id} s={s} i={i} format={format} busy={!!busy} onPatch={p => patch(s.id, p)} onGen={() => { ctrl.current = new AbortController(); void genOne(s, ctrl.current.signal); }} onDelete={() => setScenes(l => l.filter(x => x.id !== s.id))} />)}
            </div>
            {busy === 'images' ? (
              <>
                <Progress value={progress} label="Génération des images" />
                <button className="secondary-button full" onClick={() => ctrl.current?.abort()}><Square size={15} /> Arrêter</button>
              </>
            ) : (
              <button className="primary-button full" onClick={genAll} disabled={!!busy || ready === scenes.length}><ImagePlus size={17} /> {ready ? 'Créer les images manquantes' : 'Créer toutes les images'}</button>
            )}
            {status && busy === 'images' && <p className="status-line"><Loader2 size={14} className="spin" /> {status}</p>}

            <div className="divider" />
            <h3 className="sub-title"><Film size={17} /> Monter la vidéo</h3>
            {!support ? (
              <p className="warn-box"><Info size={15} /> Ton navigateur ne peut pas enregistrer de vidéo. Tes images restent disponibles dans la galerie. Essaie Chrome, Edge, Firefox ou Safari 15+.</p>
            ) : (
              <>
                <label className="field-label" htmlFor="sec">Durée par scène : {seconds} s</label>
                <input id="sec" type="range" min={2} max={8} step={1} value={seconds} onChange={e => setSeconds(Number(e.target.value))} className="range" />
                <Toggle checked={captions} onChange={setCaptions} label="Texte à l’écran" hint="Sous-titres élégants sur chaque scène" />
                <Toggle checked={narration} onChange={setNarration} label="Voix off (Piper, open source)" hint="Téléchargement unique de ~60 Mo, calcul sur ton appareil" />
                {busy === 'video' ? (
                  <>
                    <Progress value={progress} label="Montage" />
                    <p className="status-line"><Loader2 size={14} className="spin" /> {status}</p>
                    <button className="secondary-button full" onClick={() => ctrl.current?.abort()}><Square size={15} /> Arrêter</button>
                  </>
                ) : (
                  <button className="primary-button full glow" onClick={montage} disabled={!!busy || !ready}><Clapperboard size={17} /> Monter la vidéo ({ready} scène{ready > 1 ? 's' : ''})</button>
                )}
                <p className="disclaimer">Le montage se fait en temps réel dans ton navigateur ({support.includes('mp4') ? 'MP4' : 'WebM'}) : garde l’écran allumé et l’onglet ouvert.</p>
              </>
            )}
            {videoUrl && video && (
              <motion.div className="video-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <video src={videoUrl} controls playsInline />
                <button className="primary-button full" onClick={() => downloadBlob(video, `nexus-video.${extFor(video.type)}`)}><Download size={16} /> Télécharger la vidéo</button>
              </motion.div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SceneCard({ s, i, format, busy, onPatch, onGen, onDelete }: { s: Scene; i: number; format: Format; busy: boolean; onPatch: (p: Partial<Scene>) => void; onGen: () => void; onDelete: () => void }) {
  const url = useObjectUrl(s.image);
  return (
    <motion.div className="scene-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
      <div className={`scene-thumb ${format}`}>
        {url ? <img src={url} alt={s.title} /> : s.status === 'working' ? <Loader2 className="spin" size={22} /> : <span>{i + 1}</span>}
      </div>
      <div className="scene-body">
        <input className="scene-title" value={s.title} onChange={e => onPatch({ title: e.target.value })} aria-label={`Titre de la scène ${i + 1}`} />
        <textarea value={s.caption} onChange={e => onPatch({ caption: e.target.value })} rows={2} aria-label="Texte à l’écran" placeholder="Texte à l’écran" />
        <details>
          <summary>Voix off & prompt image</summary>
          <textarea value={s.narration} onChange={e => onPatch({ narration: e.target.value })} rows={2} aria-label="Voix off" />
          <textarea value={s.imagePrompt} onChange={e => onPatch({ imagePrompt: e.target.value, image: undefined, status: 'idle' })} rows={3} aria-label="Prompt image (anglais)" />
        </details>
        {s.error && <small className="error-text">{s.error}</small>}
        <div className="card-actions">
          <button onClick={onGen} disabled={busy || s.status === 'working'} aria-label={s.image ? 'Recréer l’image' : 'Créer l’image'}>{s.image ? <RefreshCw size={14} /> : <ImagePlus size={14} />}</button>
          {s.image && <button onClick={() => downloadBlob(s.image!, `scene-${i + 1}.${extFor(s.image!.type)}`)} aria-label="Télécharger l’image"><Download size={14} /></button>}
          <button onClick={onDelete} disabled={busy} aria-label="Supprimer la scène"><Trash2 size={14} /></button>
        </div>
      </div>
    </motion.div>
  );
}

/* =========================================================
   Vidéo générée par IA (expérimental, quotas)
   ========================================================= */
function AiVideo() {
  const settings = useSettings();
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<'ltx' | 'pollinations'>('ltx');
  const [format, setFormat] = useState<Format>('landscape');
  const [seconds, setSeconds] = useState(3);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [video, setVideo] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const url = useObjectUrl(video);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async () => {
    if (!prompt.trim()) { toast('Décris la scène à animer.', 'info'); return; }
    ctrl.current = new AbortController();
    setBusy(true); setError(''); setVideo(null);
    try {
      let p = prompt;
      if (prompt.split(/\s+/).length < 20) {
        setStatus('NEXUS précise la scène…');
        try { p = await enhancePrompt(`${prompt}\n(For a short video: describe one clear action and camera movement.)`, '', ctrl.current.signal); } catch { /* brut */ }
      }
      const blob = engine === 'ltx'
        ? await ltxVideo(p, { format, seconds, signal: ctrl.current.signal, onStatus: setStatus })
        : await pollinationsVideo(p, seconds, ctrl.current.signal);
      setVideo(blob);
      await addToGallery(blob, { kind: 'video', prompt: p, source: engine === 'ltx' ? 'LTX-Video (HF)' : `Pollinations+ ${settings.video.keyModel}` });
      toast('Vidéo créée et enregistrée dans ta galerie.');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Échec.');
    } finally {
      setBusy(false); setStatus('');
    }
  };

  return (
    <div className="studio-layout">
      <section className="panel generator-panel">
        <div className="panel-title">
          <span className="large-icon"><Sparkles size={21} /></span>
          <div><h2>Vidéo générée par IA</h2><p>Courts clips (2 à 4 s) créés par un modèle open source.</p></div>
        </div>
        <div className="warn-box">
          <Info size={16} />
          <div>
            <b>À savoir, honnêtement :</b>
            <ul>
              <li><b>LTX-Video</b> (open source) tourne sur un espace Hugging Face gratuit avec un <b>quota GPU quotidien</b> par personne : quelques vidéos par jour au mieux, parfois aucune si le quota est épuisé ou l’espace en veille.</li>
              <li>Un <b>jeton Hugging Face gratuit</b> (Réglages → Clés) augmente ce quota.</li>
              <li><b>Pollinations+</b> (Wan, Veo…) exige une clé avec crédit « Pollen ».</li>
              <li>Le mode <b>Projet → vidéo</b> fonctionne toujours, sans quota GPU.</li>
            </ul>
          </div>
        </div>
        <label className="field-label" htmlFor="vp">Scène à animer</label>
        <textarea id="vp" className="prompt-area" rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ex. : une rose en cristal rose tourne lentement sous une lumière dorée, travelling avant" />
        <div className="two-cols">
          <div>
            <label className="field-label" htmlFor="ve">Moteur</label>
            <select id="ve" className="settings-input" value={engine} onChange={e => setEngine(e.target.value as 'ltx' | 'pollinations')}>
              <option value="ltx">LTX-Video (Hugging Face, gratuit avec quota)</option>
              <option value="pollinations" disabled={!settings.keys.pollinations}>Pollinations+ {settings.keys.pollinations ? `(${settings.video.keyModel})` : '(clé requise)'}</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="vf">Format</label>
            <select id="vf" className="settings-input" value={format} onChange={e => setFormat(e.target.value as Format)}>
              <option value="landscape">Horizontal</option><option value="portrait">Vertical</option><option value="square">Carré</option>
            </select>
          </div>
        </div>
        <label className="field-label" htmlFor="vs">Durée : {seconds} s</label>
        <input id="vs" type="range" className="range" min={2} max={4} value={seconds} onChange={e => setSeconds(Number(e.target.value))} />
        {busy ? (
          <button className="primary-button full stop" onClick={() => ctrl.current?.abort()}><Square size={16} /> Arrêter</button>
        ) : (
          <button className="primary-button full glow" onClick={run}><Film size={17} /> Générer le clip</button>
        )}
        {status && <p className="status-line"><Loader2 size={14} className="spin" /> {status}</p>}
        {error && <p className="error-box">{error}</p>}
      </section>
      <section className="panel queue-panel">
        <div className="queue-heading"><div><span className="eyebrow">Résultat</span><h3>Ton clip</h3></div></div>
        {url && video ? (
          <div className="video-result">
            <video src={url} controls playsInline loop autoPlay muted />
            <button className="primary-button full" onClick={() => downloadBlob(video, `nexus-clip.${extFor(video.type)}`)}><Download size={16} /> Télécharger</button>
          </div>
        ) : (
          <div className="empty-state"><span className="empty-icon"><Film size={26} /></span><b>{busy ? 'Génération… (1 à 5 min)' : 'Aucun clip pour le moment'}</b><p>Le clip apparaîtra ici et dans ta galerie.</p></div>
        )}
        <AiDisclaimer compact />
      </section>
    </div>
  );
}
