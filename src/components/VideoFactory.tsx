import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Factory, ImagePlus, Infinity as InfinityIcon, Info, Loader2, Play, Share2, Sparkles, Square, Trash2, Wand2 } from 'lucide-react';
import { downloadBlob, enhancePrompt, extFor, generateImage } from '../lib/images';
import { EFFECTS, FORMAT_SIZE, MOTIONS, pickMime, pickMotion, renderMotionClip, type EffectId, type Format, type MotionId } from '../lib/motion';
import { quickChat } from '../lib/providers';
import { addToGallery } from '../lib/storage';
import { Progress, toast, Toggle, useObjectUrl } from './ui';

interface Job {
  id: string;
  label: string;
  prompt?: string;
  file?: Blob;
  status: 'waiting' | 'image' | 'depth' | 'render' | 'done' | 'error';
  progress: number;
  error?: string;
  video?: Blob;
}

const IMG_DIMS: Record<Format, [number, number]> = { portrait: [768, 1344], landscape: [1344, 768], square: [1024, 1024] };

async function toDataUrl(blob: Blob, max = 768) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.9);
}

export default function VideoFactory() {
  const [ideas, setIdeas] = useState(() => localStorage.getItem('nexus.factory.ideas') ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [format, setFormat] = useState<Format>('portrait');
  const [seconds, setSeconds] = useState(5);
  const [motionId, setMotionId] = useState<MotionId>('auto');
  const [effect, setEffect] = useState<EffectId>('sparkles');
  const [variants, setVariants] = useState(1);
  const [captions, setCaptions] = useState(false);
  const [enhance, setEnhance] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [theme, setTheme] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const support = pickMime();

  useEffect(() => { try { localStorage.setItem('nexus.factory.ideas', ideas.slice(0, 20000)); } catch { /* plein */ } }, [ideas]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const lines = ideas.split('\n').map(l => l.trim()).filter(Boolean);
  const planned = lines.length * variants + photos.length;

  const patch = (id: string, p: Partial<Job>) => setJobs(list => list.map(j => (j.id === id ? { ...j, ...p } : j)));

  const suggest = async () => {
    if (!theme.trim()) { toast('Écris un thème (ex. : « bijoux roses de luxe »).', 'info'); return; }
    setSuggesting(true);
    try {
      const { text } = await quickChat([
        { role: 'system', content: 'Tu proposes des idées de plans vidéo courts et très visuels. Réponds par 10 lignes, une idée par ligne, en anglais, 15 à 30 mots chacune, sans numéro ni puce, sans point-virgule.' },
        { role: 'user', content: `Thème : ${theme}` }
      ]);
      const out = text.split('\n').map(l => l.replace(/^[\s\-*\d.)]+/, '').replace(/;/g, ',').trim()).filter(l => l.length > 8).slice(0, 10);
      setIdeas(prev => [prev.trim(), ...out].filter(Boolean).join('\n'));
      toast(`${out.length} idées ajoutées.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Idées indisponibles.', 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const start = async () => {
    if (!support) { toast('Ce navigateur ne peut pas enregistrer de vidéo. Sur iPhone, utilise Safari à jour.', 'error'); return; }
    const list: Job[] = [
      ...lines.flatMap((l, i) => Array.from({ length: variants }, (_, v) => ({ id: `${Date.now()}-${i}-${v}`, label: l, prompt: l, status: 'waiting' as const, progress: 0 }))),
      ...photos.map((f, i) => ({ id: `${Date.now()}-p${i}`, label: f.name, file: f, status: 'waiting' as const, progress: 0 }))
    ];
    if (!list.length) { toast('Ajoute au moins une idée (une par ligne) ou une photo.', 'info'); return; }
    setJobs(list);
    setRunning(true);
    ctrl.current = new AbortController();
    const signal = ctrl.current.signal;
    // Garde l’écran allumé pendant la fabrication (iPhone : iOS 16.4+).
    let lock: { release(): Promise<void> } | null = null;
    try { lock = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* non disponible */ }
    let ok = 0;
    const { estimateDepth } = await import('../lib/localllm');
    for (let i = 0; i < list.length; i++) {
      if (signal.aborted) break;
      const job = list[i];
      try {
        let image = job.file;
        if (!image) {
          patch(job.id, { status: 'image', progress: 0.05 });
          let p = job.prompt!;
          if (enhance) { try { p = await enhancePrompt(p, '', signal); } catch { /* idée brute */ } }
          const [w, h] = IMG_DIMS[format];
          image = (await generateImage(p, { width: w, height: h, engine: 'pollinations', signal })).blob;
          void addToGallery(image, { kind: 'image', prompt: p, source: 'Pollinations', width: w, height: h });
        }
        patch(job.id, { status: 'depth', progress: 0.3 });
        const depth = await estimateDepth(await toDataUrl(image), pr => pr.file && patch(job.id, { progress: 0.3 + 0.05 * (pr.progress / 100) }));
        patch(job.id, { status: 'render', progress: 0.4 });
        const video = await renderMotionClip(image, depth, {
          format, seconds, effect, motion: pickMotion(motionId, i), signal,
          caption: captions && job.prompt ? job.prompt : undefined,
          onProgress: r => patch(job.id, { progress: 0.4 + 0.6 * r })
        });
        await addToGallery(video, { kind: 'video', prompt: job.label, source: 'NEXUS Motion 3D (sur l’appareil)', width: FORMAT_SIZE[format][0], height: FORMAT_SIZE[format][1] });
        patch(job.id, { status: 'done', progress: 1, video });
        ok++;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError' || signal.aborted) { patch(job.id, { status: 'waiting', progress: 0 }); break; }
        patch(job.id, { status: 'error', error: e instanceof Error ? e.message.split('\n')[0] : 'Échec' });
      }
    }
    try { await lock?.release(); } catch { /* déjà libéré */ }
    setRunning(false);
    toast(`${ok} vidéo${ok > 1 ? 's' : ''} créée${ok > 1 ? 's' : ''} et enregistrée${ok > 1 ? 's' : ''} dans ta galerie.`);
  };

  const done = jobs.filter(j => j.status === 'done');
  const shareAll = async () => {
    const files = done.map((j, i) => new File([j.video!], `nexus-video-${i + 1}.${extFor(j.video!.type)}`, { type: j.video!.type }));
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files })) { try { await nav.share({ files, title: 'Vidéos NEXUS' }); } catch { /* annulé */ } }
    else { files.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 600)); }
  };

  const overall = jobs.length ? jobs.reduce((n, j) => n + (j.status === 'done' || j.status === 'error' ? 1 : j.progress), 0) / jobs.length : 0;

  return (
    <div className="studio-layout">
      <section className="panel generator-panel">
        <div className="panel-title">
          <span className="large-icon"><Factory size={21} /></span>
          <div><h2>Usine à vidéos <InfinityIcon size={18} aria-label="illimité" /></h2><p>Crée des dizaines de vidéos à la suite, directement sur ton téléphone.</p></div>
        </div>
        <div className="notice-box">
          <Sparkles size={18} />
          <p><b>Comment ça marche :</b> pour chaque idée, NEXUS crée une image (Pollinations, gratuit), puis <b>ton téléphone</b> calcule la profondeur 3D (IA open source Depth Anything V2) et filme un vrai mouvement de caméra avec des effets. Le montage se fait sur l’appareil : <b>aucune limite</b> pour tes propres photos ; pour les idées, seule la création d’image dépend de Pollinations (quelques secondes d’attente entre deux images).</p>
        </div>

        <label className="field-label" htmlFor="ideas">Tes idées — une par ligne ({lines.length})</label>
        <textarea id="ideas" className="prompt-area batch-area" rows={7} value={ideas} onChange={e => setIdeas(e.target.value)}
          placeholder={'un flacon de parfum rose sur du marbre, lumière dorée\nun château de cristal au coucher du soleil\nune plage tropicale vue du ciel, eau turquoise'} />
        <div className="input-with-button">
          <input className="settings-input" value={theme} onChange={e => setTheme(e.target.value)} placeholder="Thème pour 10 idées automatiques…" aria-label="Thème" />
          <button className="secondary-button" onClick={suggest} disabled={suggesting || running}>{suggesting ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} Idées</button>
        </div>

        <div className="inline-actions">
          <button className="ghost-button" onClick={() => fileRef.current?.click()} disabled={running}><ImagePlus size={15} /> Ajouter mes photos ({photos.length})</button>
          {photos.length > 0 && <button className="ghost-button" onClick={() => setPhotos([])} disabled={running}><Trash2 size={15} /> Retirer</button>}
          {lines.length > 0 && <button className="ghost-button" onClick={() => setIdeas('')} disabled={running}><Trash2 size={15} /> Vider les idées</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { setPhotos(p => [...p, ...Array.from(e.target.files ?? [])].slice(0, 100)); e.target.value = ''; }} />

        <div className="two-cols">
          <div>
            <label className="field-label" htmlFor="ff">Format</label>
            <select id="ff" className="settings-input" value={format} onChange={e => setFormat(e.target.value as Format)}>
              <option value="portrait">Vertical 9:16</option><option value="landscape">Horizontal 16:9</option><option value="square">Carré 1:1</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="fv">Variantes par idée</label>
            <select id="fv" className="settings-input" value={variants} onChange={e => setVariants(Number(e.target.value))}>{[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div>
            <label className="field-label" htmlFor="fm">Mouvement de caméra</label>
            <select id="fm" className="settings-input" value={motionId} onChange={e => setMotionId(e.target.value as MotionId)}>{MOTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </div>
          <div>
            <label className="field-label" htmlFor="fe">Effet</label>
            <select id="fe" className="settings-input" value={effect} onChange={e => setEffect(e.target.value as EffectId)}>{EFFECTS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </div>
        </div>
        <label className="field-label" htmlFor="fs">Durée de chaque vidéo : {seconds} s</label>
        <input id="fs" type="range" className="range" min={3} max={12} value={seconds} onChange={e => setSeconds(Number(e.target.value))} />
        <Toggle checked={captions} onChange={setCaptions} label="Afficher l’idée en sous-titre" />
        <Toggle checked={enhance} onChange={setEnhance} label="Améliorer chaque idée avec l’IA" hint="Plus beau, mais plus lent (une requête de chat par vidéo)" />

        {running ? (
          <button className="primary-button full stop" onClick={() => ctrl.current?.abort()}><Square size={16} /> Arrêter</button>
        ) : (
          <button className="primary-button full glow" onClick={start} disabled={!planned}><Play size={17} /> Fabriquer {planned || ''} vidéo{planned > 1 ? 's' : ''}</button>
        )}
        <p className="disclaimer"><Info size={12} /> Garde l’écran allumé et NEXUS ouvert pendant la fabrication. Comptes environ {seconds + 15} s par vidéo à partir d’une idée ({Math.round((planned * (seconds + 15)) / 60)} min pour {planned || 'ta liste'}), {seconds + 3} s à partir d’une photo. Premier usage : téléchargement unique du modèle de profondeur (27 Mo).</p>
      </section>

      <section className="panel queue-panel">
        <div className="queue-heading">
          <div><span className="eyebrow">Production</span><h3>{done.length} / {jobs.length} vidéos</h3></div>
          {done.length > 1 && <button className="secondary-button" onClick={shareAll}><Share2 size={15} /> Tout enregistrer</button>}
        </div>
        {jobs.length > 0 && <Progress value={overall} label="Avancement global" />}
        {jobs.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Factory size={26} /></span><b>Ta chaîne de production est prête</b><p>Ajoute des idées ou des photos, puis lance la fabrication. Chaque vidéo est aussi enregistrée dans ta galerie.</p></div>
        ) : (
          <div className="job-list">{jobs.map((j, i) => <JobCard key={j.id} job={j} index={i} />)}</div>
        )}
      </section>
    </div>
  );
}

const STATUS: Record<Job['status'], string> = { waiting: 'En attente', image: 'Création de l’image…', depth: 'Analyse 3D…', render: 'Tournage…', done: 'Prête', error: 'Échec' };

function JobCard({ job, index }: { job: Job; index: number }) {
  const url = useObjectUrl(job.video);
  return (
    <motion.div className={`job-card ${job.status}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <div className="job-thumb">{url ? <video src={`${url}#t=1.2`} muted playsInline preload="metadata" /> : job.status === 'waiting' ? <span>{index + 1}</span> : job.status === 'error' ? <span>!</span> : <Loader2 className="spin" size={18} />}</div>
      <div className="job-body">
        <b>{job.label}</b>
        <small>{job.error ?? STATUS[job.status]}</small>
        {job.status !== 'done' && job.status !== 'waiting' && job.status !== 'error' && <Progress value={job.progress} label={STATUS[job.status]} />}
      </div>
      {job.video && <button className="icon-button small" onClick={() => downloadBlob(job.video!, `nexus-video-${index + 1}.${extFor(job.video!.type)}`)} aria-label="Télécharger la vidéo"><Download size={15} /></button>}
    </motion.div>
  );
}
