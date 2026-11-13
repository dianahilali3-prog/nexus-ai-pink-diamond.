import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Download, Film, FolderHeart, ImagePlus, Share2, Trash2, X } from 'lucide-react';
import { downloadBlob, extFor, shareBlob } from '../lib/images';
import { deleteGalleryItem, getGalleryBlob, listGallery } from '../lib/storage';
import type { GalleryItem } from '../lib/types';
import { copyText, EmptyState, formatDate, go, Portal, setIntent, toast, useObjectUrl } from './ui';

export default function Gallery() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [open, setOpen] = useState<GalleryItem | null>(null);

  useEffect(() => {
    const load = () => listGallery().then(setItems);
    load();
    window.addEventListener('nexus-gallery', load);
    return () => window.removeEventListener('nexus-gallery', load);
  }, []);

  const shown = (items ?? []).filter(i => filter === 'all' || i.kind === filter);

  return (
    <section className="panel library-panel">
      <div className="panel-title">
        <span className="large-icon"><FolderHeart size={21} /></span>
        <div><h2>Ta galerie</h2><p>Images et vidéos enregistrées uniquement sur cet appareil.</p></div>
      </div>
      <div className="chip-select" role="radiogroup" aria-label="Filtrer">
        {(['all', 'image', 'video'] as const).map(f => (
          <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tout' : f === 'image' ? 'Images' : 'Vidéos'} <small>{(items ?? []).filter(i => f === 'all' || i.kind === f).length}</small>
          </button>
        ))}
      </div>
      {items && shown.length === 0 ? (
        <EmptyState icon={FolderHeart} title="Ta galerie est encore vide" text="Les images et vidéos que tu crées s’enregistrent ici automatiquement.">
          <div className="row-actions center">
            <button className="primary-button" onClick={() => go('images')}><ImagePlus size={16} /> Créer une image</button>
            <button className="secondary-button" onClick={() => go('videos')}><Film size={16} /> Créer une vidéo</button>
          </div>
        </EmptyState>
      ) : (
        <div className="gallery-grid">
          {shown.map(i => <Thumb key={i.id} item={i} onOpen={() => setOpen(i)} />)}
        </div>
      )}
      <Portal><AnimatePresence>{open && <Viewer item={open} onClose={() => setOpen(null)} />}</AnimatePresence></Portal>
    </section>
  );
}

function useBlob(id: string) {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => { let live = true; getGalleryBlob(id).then(b => live && setBlob(b ?? null)); return () => { live = false; }; }, [id]);
  return blob;
}

function Thumb({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const url = useObjectUrl(useBlob(item.id));
  return (
    <button className="gallery-thumb" onClick={onOpen} aria-label={`Ouvrir : ${item.prompt.slice(0, 60)}`}>
      {url ? (item.kind === 'video' ? <video src={url} muted playsInline preload="metadata" /> : <img src={url} alt="" loading="lazy" />) : <span className="img-skeleton" />}
      {item.kind === 'video' && <span className="thumb-badge"><Film size={12} /> Vidéo</span>}
    </button>
  );
}

function Viewer({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  const blob = useBlob(item.id);
  const url = useObjectUrl(blob);
  const name = `nexus-${item.kind}-${item.id.slice(0, 8)}.${extFor(item.mime)}`;
  const remove = async () => {
    if (!confirm('Supprimer définitivement cet élément de ta galerie ?')) return;
    await deleteGalleryItem(item.id);
    toast('Supprimé.');
    onClose();
  };
  return (
    <motion.div className="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-label="Aperçu">
      <motion.div className="viewer-inner" onClick={e => e.stopPropagation()} initial={{ scale: 0.96 }} animate={{ scale: 1 }}>
        <button className="icon-button viewer-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        {url && (item.kind === 'video' ? <video src={url} controls playsInline autoPlay /> : <img src={url} alt={item.prompt} />)}
        <div className="viewer-info">
          <p>{item.prompt}</p>
          <small>{item.source} · {formatDate(item.createdAt)}{item.width ? ` · ${item.width}×${item.height}` : ''}</small>
          <div className="row-actions">
            <button className="primary-button" onClick={() => blob && downloadBlob(blob, name)}><Download size={16} /> Télécharger</button>
            <button className="secondary-button" onClick={async () => { if (blob && !(await shareBlob(blob, name, item.prompt))) toast('Partage non disponible ici.', 'info'); }}><Share2 size={16} /> Partager</button>
            <button className="secondary-button" onClick={() => copyText(item.prompt)}><Copy size={16} /> Prompt</button>
            {item.kind === 'image' && <button className="secondary-button" onClick={() => { setIntent({ type: 'image', prompt: item.prompt }); go('images'); }}><ImagePlus size={16} /> Variante</button>}
            <button className="danger-button" onClick={remove}><Trash2 size={16} /> Supprimer</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
