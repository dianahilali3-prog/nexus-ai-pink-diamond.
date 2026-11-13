import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Check, Code2, FileText, Gem, Heart, ImagePlus, Info, Search, Sparkles, Star, Workflow, X, type LucideIcon
} from 'lucide-react';
import type { Tab } from '../lib/types';

/* ---------- Icônes d’agents ---------- */
export const AGENT_ICON: Record<string, LucideIcon> = {
  gem: Gem, sparkles: Sparkles, search: Search, image: ImagePlus, workflow: Workflow, file: FileText, code: Code2, heart: Heart, star: Star
};

/* ---------- Notifications ---------- */
type ToastKind = 'ok' | 'info' | 'error';
interface Toast { id: number; text: string; kind: ToastKind }
let toasts: Toast[] = [];
const tl = new Set<() => void>();
let tid = 0;
export function toast(text: string, kind: ToastKind = 'ok', ms = 3600) {
  const t = { id: ++tid, text, kind };
  toasts = [...toasts.slice(-2), t];
  tl.forEach(l => l());
  setTimeout(() => { toasts = toasts.filter(x => x.id !== t.id); tl.forEach(l => l()); }, ms);
}
export function Toasts() {
  const list = useSyncExternalStore(l => { tl.add(l); return () => tl.delete(l); }, () => toasts);
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      <AnimatePresence>
        {list.map(t => (
          <motion.div key={t.id} className={`toast toast-${t.kind}`} initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
            {t.kind === 'error' ? <AlertTriangle size={16} /> : t.kind === 'info' ? <Info size={16} /> : <Check size={16} />}
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Intentions de navigation entre écrans ---------- */
export type Intent =
  | { type: 'chat'; agentId?: string; prompt?: string; newChat?: boolean; conversationId?: string }
  | { type: 'image'; prompt: string }
  | { type: 'video'; text: string };
let intent: Intent | null = null;
export const setIntent = (i: Intent) => { intent = i; };
export const takeIntent = <T extends Intent['type']>(type: T): Extract<Intent, { type: T }> | null => {
  if (intent?.type !== type) return null;
  const i = intent as Extract<Intent, { type: T }>;
  intent = null;
  return i;
};

export function go(tab: Tab) {
  window.location.hash = `#/${tab}`;
}

/* ---------- Petits composants ---------- */
export function EmptyState({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={26} /></span>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="progressbar" aria-label={label ?? 'Chargement'} />;
}

export function AiDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <p className={`ai-disclaimer ${compact ? 'compact' : ''}`}>
      <Info size={13} aria-hidden /> L’IA peut se tromper ou inventer. Vérifie les informations importantes.
    </p>
  );
}

/** Affiche au niveau de la page (évite d’être coincé dans un panneau flouté). */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="modal-head">
              <h2>{title}</h2>
              <button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function formatDate(t: number) {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copié.');
  }
}

/** Libère une URL d’objet quand le composant disparaît. */
export function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}
