import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadBlob, extFor } from '../lib/images';
import { getGalleryBlob, getGalleryItem } from '../lib/storage';
import type { GalleryItem } from '../lib/types';
import { useObjectUrl } from './ui';

export function GalleryImage({ id }: { id: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [meta, setMeta] = useState<GalleryItem | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([getGalleryBlob(id), getGalleryItem(id)]).then(([b, m]) => {
      if (!live) return;
      if (b) { setBlob(b); setMeta(m ?? null); } else setMissing(true);
    });
    return () => { live = false; };
  }, [id]);
  const url = useObjectUrl(blob);
  if (missing) return <p className="muted-text">Image supprimée de la galerie.</p>;
  if (!url) return <div className="img-skeleton" />;
  return (
    <figure className="chat-image">
      {meta?.kind === 'video' ? <video src={url} controls playsInline /> : <img src={url} alt={meta?.prompt ?? 'Image générée'} />}
      <button className="img-dl" onClick={() => blob && downloadBlob(blob, `nexus-${id.slice(0, 8)}.${extFor(blob.type)}`)} aria-label="Télécharger"><Download size={16} /></button>
    </figure>
  );
}
