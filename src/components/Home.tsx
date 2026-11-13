import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, Bot, ChevronRight, Clapperboard, Crown, FileText, Gem, Globe, ImagePlus, Layers3, MessageCircle, Mic, ShieldCheck
} from 'lucide-react';
import { activeProviders, PROVIDERS } from '../lib/providers';
import { useSettings } from '../lib/settings';
import { galleryCount, listConversations } from '../lib/storage';
import { AiDisclaimer, go, setIntent } from './ui';
import type { LucideIcon } from 'lucide-react';

const FEATURES: { icon: LucideIcon; title: string; desc: string; tag: string; action: () => void }[] = [
  { icon: MessageCircle, title: 'Parler à NEXUS', desc: 'Questions, rédaction, conseils', tag: 'CHAT', action: () => go('chat') },
  { icon: Mic, title: 'Conversation vocale', desc: 'Parle, NEXUS te répond à voix haute', tag: 'VOIX', action: () => go('chat') },
  { icon: ImagePlus, title: 'Créer une image', desc: 'De l’idée à l’image en 20 s', tag: 'IMAGE', action: () => go('images') },
  { icon: Clapperboard, title: 'Rapport → vidéo', desc: 'Storyboard, images et montage', tag: 'VIDÉO', action: () => go('videos') },
  { icon: FileText, title: 'Analyser un document', desc: 'PDF, Word : résumé, questions', tag: 'DOCUMENTS', action: () => { setIntent({ type: 'chat', agentId: 'scribe', newChat: true }); go('chat'); } },
  { icon: Globe, title: 'Rechercher', desc: 'Réponses sourcées (Wikipédia)', tag: 'RECHERCHE', action: () => { setIntent({ type: 'chat', agentId: 'orion', newChat: true }); go('chat'); } }
];

export default function Home() {
  const s = useSettings();
  const [stats, setStats] = useState({ convs: 0, media: 0 });
  useEffect(() => {
    Promise.all([listConversations(), galleryCount()]).then(([c, g]) => setStats({ convs: c.length, media: g }));
  }, []);
  const providers = activeProviders(s);

  return (
    <>
      <section className="hero-card">
        <div className="hero-orbit orbit-a" /><div className="hero-orbit orbit-b" />
        <div className="sparkles" aria-hidden>{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
        <div className="hero-copy">
          <div className="hero-kicker"><Crown size={13} /> PINK DIAMOND EDITION</div>
          <h2>Imagine plus.<br /><em>Crée avec NEXUS.</em></h2>
          <p>Ton assistant IA gratuit et open source : il parle, cherche, lit tes documents et crée des images et des vidéos.</p>
          <div className="hero-buttons">
            <button className="hero-button" onClick={() => go('chat')}>Commencer <ChevronRight size={16} /></button>
            <button className="hero-button ghost" onClick={() => go('videos')}>Rapport → vidéo</button>
          </div>
        </div>
        <motion.div className="hero-gem" animate={{ y: [0, -8, 0], rotate: [0, 3, -2, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}>
          <div className="gem-glow" />
          <Gem size={84} strokeWidth={1.05} />
          <span className="gem-spark spark-one">✦</span>
          <span className="gem-spark spark-two">✧</span>
        </motion.div>
      </section>

      <div className="section-title">
        <div><span className="eyebrow">Accès rapide</span><h2>Que souhaites-tu faire ?</h2></div>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f, i) => (
          <motion.button key={f.title} className="feature-card" onClick={f.action} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
            <div className="feature-top"><span className="feature-icon"><f.icon size={19} /></span><span className="feature-arrow"><ArrowUpRight size={15} /></span></div>
            <span className="feature-tag">{f.tag}</span>
            <b>{f.title}</b>
            <small>{f.desc}</small>
          </motion.button>
        ))}
      </div>

      <div className="section-title compact"><div><span className="eyebrow">Ton espace</span><h2>Vue d’ensemble</h2></div></div>
      <div className="stats-grid">
        <button className="stat-card" onClick={() => go('chat')}><span className="stat-icon"><MessageCircle size={17} /></span><b>{stats.convs}</b><small>Conversations</small></button>
        <button className="stat-card" onClick={() => go('library')}><span className="stat-icon"><Layers3 size={17} /></span><b>{stats.media}</b><small>Créations</small></button>
        <button className="stat-card" onClick={() => go('settings')}><span className="stat-icon"><Bot size={17} /></span><b>{providers.length}</b><small>{providers[0] ? PROVIDERS[providers[0]].short : 'Aucun moteur'}</small></button>
      </div>

      <button className="prototype-note link" onClick={() => go('privacy')}>
        <ShieldCheck size={16} />
        <span><b>Privé par conception :</b> tes données restent sur cet appareil. Voir quelles informations partent vers quels services →</span>
      </button>
      <AiDisclaimer />
    </>
  );
}
