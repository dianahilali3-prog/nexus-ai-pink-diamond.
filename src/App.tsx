import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  Bot, Clapperboard, Compass, FolderHeart, Gem, ImagePlus, Menu, MessageCircle, Settings2, ShieldCheck, Sparkles, WifiOff, X
} from 'lucide-react';
import Home from './components/Home';
import ChatView from './components/ChatView';
import { Spinner, Toasts } from './components/ui';
import { activeProviders, PROVIDERS } from './lib/providers';
import { useSettings } from './lib/settings';
import type { Tab } from './lib/types';

const ImageStudio = lazy(() => import('./components/ImageStudio'));
const VideoStudio = lazy(() => import('./components/VideoStudio'));
const Gallery = lazy(() => import('./components/Gallery'));
const AgentsView = lazy(() => import('./components/AgentsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const PrivacyView = lazy(() => import('./components/PrivacyView'));

const NAV: { id: Tab; label: string; short: string; icon: typeof Sparkles }[] = [
  { id: 'home', label: 'Accueil', short: 'Accueil', icon: Compass },
  { id: 'chat', label: 'Assistant IA', short: 'Chat', icon: MessageCircle },
  { id: 'images', label: 'Studio Image', short: 'Images', icon: ImagePlus },
  { id: 'videos', label: 'Studio Vidéo', short: 'Vidéos', icon: Clapperboard },
  { id: 'library', label: 'Ma galerie', short: 'Galerie', icon: FolderHeart },
  { id: 'agents', label: 'Agents', short: 'Agents', icon: Bot },
  { id: 'settings', label: 'Réglages', short: 'Réglages', icon: Settings2 },
  { id: 'privacy', label: 'Confidentialité', short: 'Vie privée', icon: ShieldCheck }
];
const MOBILE_NAV: Tab[] = ['home', 'chat', 'images', 'videos', 'library'];
const TABS = NAV.map(n => n.id);

function readHash(): Tab {
  const t = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Tab;
  return TABS.includes(t) ? t : 'home';
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const settings = useSettings();
  const providers = activeProviders(settings);

  useEffect(() => {
    const onHash = () => { setTab(readHash()); setMenuOpen(false); window.scrollTo({ top: 0 }); };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const label = NAV.find(n => n.id === tab)?.label;
    document.title = tab === 'home' ? 'NEXUS AI — Pink Diamond' : `${label} · NEXUS AI`;
  }, [tab]);

  const go = (t: Tab) => { window.location.hash = `#/${t}`; };
  const current = NAV.find(n => n.id === tab)!;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app-shell tab-${tab}`}>
        <a className="skip-link" href="#main">Aller au contenu</a>
        <div className="ambient ambient-one" aria-hidden /><div className="ambient ambient-two" aria-hidden /><div className="ambient ambient-three" aria-hidden />
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <button className="brand" onClick={() => go('home')} aria-label="NEXUS AI, accueil">
            <span className="brand-mark"><Gem size={19} /></span>
            <span><b>NEXUS</b><small>PINK DIAMOND</small></span>
          </button>
          <div className="topbar-right">
            <button className={`status-pill ${providers.length ? 'ok' : 'warn'}`} onClick={() => go('settings')} aria-label="État de l’IA, ouvrir les réglages">
              <i /> {online ? (providers.length ? PROVIDERS[providers[0]].short : 'Aucun moteur') : 'Hors ligne'}
            </button>
            <button className="icon-button" onClick={() => go('settings')} aria-label="Réglages"><Settings2 size={18} /></button>
          </div>
        </header>

        {!online && (
          <div className="offline-banner" role="status"><WifiOff size={15} /> Hors ligne : l’interface, ta galerie et tes conversations restent accessibles. Les réponses IA nécessitent Internet (sauf « IA dans le navigateur »).</div>
        )}

        <div className="layout">
          <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Navigation principale">
            <div className="workspace-label">ESPACE CRÉATIF</div>
            <nav>
              {NAV.map(item => (
                <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => go(item.id)} aria-current={tab === item.id ? 'page' : undefined}>
                  <item.icon size={18} /><span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="resource-card">
                <div className="resource-icon"><Sparkles size={17} /></div>
                <div><b>Moteurs IA</b><small>{providers.map(p => PROVIDERS[p].short).join(' → ') || 'aucun actif'}</small></div>
                <span className={`status-dot ${providers.length ? 'on' : ''}`} />
              </div>
              <div className="sidebar-foot">PINK DIAMOND EDITION <span>v1.0</span></div>
            </div>
          </aside>
          {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}

          <main className="main-content" id="main" tabIndex={-1}>
            {tab !== 'chat' && (
              <div className="page-heading">
                <div><div className="eyebrow"><Sparkles size={13} /> TON UNIVERS CRÉATIF</div><h1>{current.label}<span className="heading-dot">.</span></h1></div>
              </div>
            )}
            {tab === 'chat' && <h1 className="sr-only">Assistant IA</h1>}
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <Suspense fallback={<div className="page-loading"><Spinner /> Chargement…</div>}>
                  {tab === 'home' && <Home />}
                  {tab === 'chat' && <ChatView />}
                  {tab === 'images' && <ImageStudio />}
                  {tab === 'videos' && <VideoStudio />}
                  {tab === 'library' && <Gallery />}
                  {tab === 'agents' && <AgentsView />}
                  {tab === 'settings' && <SettingsView />}
                  {tab === 'privacy' && <PrivacyView />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
            {tab !== 'chat' && (
              <footer className="page-footer">
                <span><Gem size={12} /> NEXUS AI · open source · tes données restent sur ton appareil</span>
                <button className="link-button" onClick={() => go('privacy')}>Confidentialité</button>
              </footer>
            )}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Navigation rapide">
          {MOBILE_NAV.map(id => {
            const item = NAV.find(n => n.id === id)!;
            return (
              <button key={id} className={tab === id ? 'selected' : ''} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
                <item.icon size={20} /><span>{item.short}</span>
              </button>
            );
          })}
        </nav>
        <Toasts />
      </div>
    </MotionConfig>
  );
}
