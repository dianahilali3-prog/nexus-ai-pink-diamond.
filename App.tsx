import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, ArrowUp, Bot, Check, ChevronRight, CircleHelp, Clapperboard,
  Code2, Compass, Cpu, Crown, Film, FolderHeart, Gauge, Gem,
  ImagePlus, Layers3, Menu, MessageCircle, Mic, MoreHorizontal, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, WandSparkles, Workflow, X
} from 'lucide-react';

type Tab = 'home' | 'chat' | 'images' | 'videos' | 'library' | 'agents';
type PromptJob = { id: number; prompt: string; status: 'En attente' | 'Brouillon'; kind: 'Image' | 'Vidéo' };

const navItems: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'home', label: 'Accueil', icon: Compass },
  { id: 'chat', label: 'Assistant IA', icon: MessageCircle },
  { id: 'images', label: 'Image studio', icon: ImagePlus },
  { id: 'videos', label: 'Video studio', icon: Clapperboard },
  { id: 'library', label: 'Ma galerie', icon: FolderHeart },
  { id: 'agents', label: 'Agents', icon: Bot },
];

function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [batch, setBatch] = useState('');
  const [jobs, setJobs] = useState<PromptJob[]>(() => { try { return JSON.parse(localStorage.getItem('nexus.jobs') || '[]') as PromptJob[]; } catch { return []; } });
  const [messages, setMessages] = useState<{role:'assistant'|'user'; text:string}[]>(() => { try { const saved = localStorage.getItem('nexus.messages'); return saved ? JSON.parse(saved) : [{ role: 'assistant', text: 'Bonjour, je suis NEXUS. Configure un serveur IA dans les réglages pour activer les réponses réelles.' }]; } catch { return [{ role: 'assistant', text: 'Bonjour, je suis NEXUS. Configure un serveur IA dans les réglages pour activer les réponses réelles.' }]; } });
  const [apiBase, setApiBase] = useState(() => localStorage.getItem('nexus.apiBase') || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const queuedCount = jobs.length;
  useEffect(() => { localStorage.setItem('nexus.jobs', JSON.stringify(jobs)); }, [jobs]);
  useEffect(() => { localStorage.setItem('nexus.messages', JSON.stringify(messages)); }, [messages]);
  const title = useMemo(() => navItems.find(n => n.id === tab)?.label ?? 'Accueil', [tab]);

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3200); };
  const addJob = (kind: 'Image' | 'Vidéo', value: string) => {
    const prompts = value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!prompts.length) { notify('Ajoute au moins un prompt pour continuer.'); return; }
    setJobs(old => [...old, ...prompts.map(p => ({ id: Date.now() + Math.random(), prompt: p, status: 'Brouillon' as const, kind }))]);
    setPrompt(''); setBatch('');
    notify(`${prompts.length} prompt${prompts.length > 1 ? 's' : ''} ajouté${prompts.length > 1 ? 's' : ''} à ta file de préparation.`);
  };
  const sendMessage = async () => {
    const value = prompt.trim(); if (!value || busy) return;
    setMessages(old => [...old, { role: 'user', text: value }]);
    setPrompt('');
    if (!apiBase.trim()) { setMessages(old => [...old, { role: 'assistant', text: 'Ton message est conservé sur cet appareil. Pour obtenir une vraie réponse, configure une URL de serveur IA dans Réglages. Aucun modèle n’est connecté pour le moment.' }]); return; }
    setBusy(true);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/v1/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...messages, { role: 'user', content: value }].map(m => ({ role: m.role, content: m.text })) }) });
      if (!response.ok) throw new Error(`Serveur indisponible (${response.status})`);
      const data = await response.json() as { reply?: string };
      if (!data.reply) throw new Error('Réponse serveur invalide');
      setMessages(old => [...old, { role: 'assistant', text: data.reply! }]);
    } catch (error) { setMessages(old => [...old, { role: 'assistant', text: `Connexion impossible : ${error instanceof Error ? error.message : 'erreur inconnue'}. Vérifie l'adresse du serveur et sa disponibilité.` }]); }
    finally { setBusy(false); }
  };
  const exportData = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), jobs, messages }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'nexus-ai-export.json'; a.click(); URL.revokeObjectURL(url); notify('Export téléchargé.'); };
  const saveApiBase = (value: string) => { const clean = value.trim().replace(/\/$/, ''); setApiBase(clean); localStorage.setItem('nexus.apiBase', clean); notify(clean ? 'Adresse du serveur enregistrée.' : 'Connexion serveur désactivée.'); };

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar">
      <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Ouvrir le menu"><Menu size={19}/></button>
      <button className="brand" onClick={() => setTab('home')} aria-label="NEXUS AI accueil">
        <span className="brand-mark"><Gem size={19}/></span><span><b>NEXUS</b><small> PINK DIAMOND</small></span>
      </button>
      <div className="topbar-right"><span className="demo-pill"><i/> PROTOTYPE LOCAL</span><button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Paramètres"><Settings2 size={18}/></button><div className="avatar">N</div></div>
    </header>

    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="workspace-label">ESPACE CRÉATIF</div>
        <nav>{navItems.map(item => <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => {setTab(item.id);setMenuOpen(false);}}><item.icon size={18}/><span>{item.label}</span>{item.id === 'videos' && <span className="nav-tag">BETA</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="resource-card"><div className="resource-icon"><Cpu size={17}/></div><div><b>Moteurs IA</b><small>Non connectés</small></div><span className="status-dot"/></div><button className="nav-item muted" onClick={() => setShowSettings(true)}><ShieldCheck size={17}/> Sécurité & réglages</button><div className="sidebar-foot">PINK DIAMOND EDITION <span>v0.2.0</span></div></div>
      </aside>

      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13}/> TON UNIVERS CRÉATIF</div><h1>{title}<span className="heading-dot">.</span></h1></div><button className="round-action" onClick={() => setShowSettings(true)}><MoreHorizontal size={19}/></button></div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.2}}>
            {tab === 'home' && <Home setTab={setTab} queuedCount={queuedCount}/>}
            {tab === 'chat' && <Chat messages={messages} value={prompt} setValue={setPrompt} send={sendMessage} busy={busy}/>}
            {tab === 'images' && <Generator kind="Image" value={prompt} setValue={setPrompt} add={addJob} jobs={jobs.filter(j=>j.kind==='Image')}/>}
            {tab === 'videos' && <VideoStudio value={batch} setValue={setBatch} add={addJob} jobs={jobs.filter(j=>j.kind==='Vidéo')}/>}
            {tab === 'library' && <Library jobs={jobs}/>}
            {tab === 'agents' && <Agents/>}
          </motion.div>
        </AnimatePresence>
        <footer className="page-footer"><span><Gem size={12}/> Conçu avec élégance.</span><span>Images et vidéos : moteurs à connecter.</span></footer>
      </main>
    </div>
    <AnimatePresence>{notice && <motion.div className="toast" initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}><Check size={16}/>{notice}</motion.div>}</AnimatePresence>
    <AnimatePresence>{showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><motion.div className="modal" onClick={e=>e.stopPropagation()} initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.96}}><div className="modal-head"><div><span className="eyebrow">NEXUS AI</span><h2>Réglages du prototype</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={18}/></button></div><div className="notice-box"><ShieldCheck size={18}/><p><b>Données privées sur cet appareil</b><br/>Les conversations et prompts sont enregistrés dans le stockage local du navigateur. L'URL du serveur est conservée ici. N'inscris jamais de clé secrète dans ce champ.</p></div><label className="field-label" htmlFor="api-base">URL DE TON SERVEUR IA (HTTPS EN PRODUCTION)</label><input id="api-base" className="settings-input" value={apiBase} onChange={e=>setApiBase(e.target.value)} placeholder="https://ton-serveur.example.com" inputMode="url"/><button className="primary-button full" onClick={() => saveApiBase(apiBase)}>Enregistrer le serveur</button><div className="setting-row"><span>Version de l'interface</span><b>0.2.0</b></div><div className="setting-row"><span>Conversation IA</span><b className="pink-text">{apiBase ? 'Serveur configuré' : 'Mode local'}</b></div><button className="secondary-button full" onClick={exportData}>Exporter mes données</button><button className="primary-button full" onClick={() => setShowSettings(false)}>Fermer</button></motion.div></div>}</AnimatePresence>
    <nav className="mobile-nav">{navItems.slice(0,5).map(item => <button key={item.id} className={tab===item.id?'selected':''} onClick={()=>setTab(item.id)}><item.icon size={19}/><span>{item.id==='images'?'Images':item.id==='videos'?'Vidéos':item.id==='library'?'Galerie':item.id==='chat'?'Chat':'Accueil'}</span></button>)}</nav>
  </div>;
}

function Home({setTab,queuedCount}:{setTab:(t:Tab)=>void;queuedCount:number}) {
  return <>
    <section className="hero-card"><div className="hero-orbit orbit-a"/><div className="hero-orbit orbit-b"/><div className="hero-copy"><div className="hero-kicker"><Crown size={13}/> PINK DIAMOND EDITION</div><h2>Imagine plus.<br/><em>Crée sans limites.</em></h2><p>Ton espace créatif nouvelle génération, imaginé autour de toi.</p><button className="hero-button" onClick={()=>setTab('chat')}>Découvrir NEXUS <ChevronRight size={16}/></button></div><div className="hero-gem"><div className="gem-glow"/><Gem size={82} strokeWidth={1.05}/><span className="gem-spark spark-one">✦</span><span className="gem-spark spark-two">✧</span></div><div className="hero-bottom"><span><i/> WORKSPACE PERSONNEL</span><span>01 — CREATIVE INTELLIGENCE</span></div></section>
    <div className="section-title"><div><span className="eyebrow">ACCÈS RAPIDE</span><h2>Que souhaites-tu créer ?</h2></div><span className="subtle-count">04 MODULES</span></div>
    <div className="feature-grid">
      <Feature icon={MessageCircle} title="Parler à NEXUS" desc="Ton assistant intelligent" tag="ASSISTANT" onClick={()=>setTab('chat')}/>
      <Feature icon={ImagePlus} title="Créer une image" desc="Donne vie à tes idées" tag="IMAGE STUDIO" onClick={()=>setTab('images')}/>
      <Feature icon={Film} title="Créer une vidéo" desc="Prépare plusieurs prompts" tag="VIDEO STUDIO" onClick={()=>setTab('videos')}/>
      <Feature icon={Workflow} title="Explorer les agents" desc="Tes futurs assistants" tag="AUTOMATION" onClick={()=>setTab('agents')}/>
    </div>
    <div className="section-title compact"><div><span className="eyebrow">TON ESPACE</span><h2>Vue d'ensemble</h2></div></div>
    <div className="stats-grid"><div className="stat-card"><span className="stat-icon"><Layers3 size={17}/></span><b>{queuedCount}</b><small>Prompts préparés</small></div><div className="stat-card"><span className="stat-icon"><Gauge size={17}/></span><b>—</b><small>Moteurs actifs</small></div><div className="stat-card"><span className="stat-icon"><Activity size={17}/></span><b>Local</b><small>Mode actuel</small></div></div>
    <div className="prototype-note"><CircleHelp size={16}/><span><b>À savoir :</b> cette version est le socle visuel et interactif. Les générations réelles nécessiteront de connecter des modèles et une infrastructure de calcul.</span></div>
  </>;
}
function Feature({icon:Icon,title,desc,tag,onClick}:{icon:typeof Sparkles;title:string;desc:string;tag:string;onClick:()=>void}) {return <button className="feature-card" onClick={onClick}><div className="feature-top"><span className="feature-icon"><Icon size={19}/></span><span className="feature-arrow"><ArrowUp size={15}/></span></div><span className="feature-tag">{tag}</span><b>{title}</b><small>{desc}</small></button>}
function Chat({messages,value,setValue,send,busy}:{messages:{role:'assistant'|'user';text:string}[];value:string;setValue:(s:string)=>void;send:()=>void;busy:boolean}) {return <div className="panel chat-panel"><div className="panel-head"><div className="assistant-avatar"><Sparkles size={19}/></div><div><b>NEXUS Assistant</b><small><i className="offline-dot"/> {busy ? 'NEXUS réfléchit…' : 'Assistant · connexion selon réglages'}</small></div><span className="demo-pill">NEXUS</span></div><div className="chat-messages">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}><div className="message-avatar">{m.role==='assistant'?<Gem size={14}/>: 'N'}</div><div className="message-bubble">{m.text}</div></div>)}</div><div className="chat-compose"><textarea value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Écris ton message à NEXUS..." rows={2}/><div className="compose-bottom"><span><Mic size={15}/> Vocal bientôt disponible</span><button className="send-button" onClick={send} disabled={busy || !value.trim()} aria-label="Envoyer">{busy ? <span className="spinner"/> : <Send size={17}/>}</button></div></div></div>}
function Generator({kind,value,setValue,add,jobs}:{kind:'Image';value:string;setValue:(s:string)=>void;add:(k:'Image'|'Vidéo',v:string)=>void;jobs:PromptJob[]}) {return <div className="studio-layout"><div className="panel generator-panel"><div className="panel-title"><span className="large-icon"><WandSparkles size={21}/></span><div><h2>Image studio</h2><p>Décris l'image que tu imagines.</p></div></div><label className="field-label">TON PROMPT</label><textarea className="prompt-area" value={value} onChange={e=>setValue(e.target.value)} placeholder="Ex. : portrait éditorial haute couture, lumière rose nacrée, bijoux chromés, photographie de luxe..." rows={5}/><div className="prompt-hint"><Sparkles size={13}/> Astuce : précise le sujet, l'ambiance, la lumière et le style.</div><button className="primary-button full" onClick={()=>add(kind,value)}><Plus size={17}/> Ajouter à mes prompts</button><p className="disclaimer">Ajout à la file de préparation uniquement. Aucun rendu d'image n'est lancé tant qu'un moteur n'est pas connecté.</p></div><div className="panel queue-panel"><div className="queue-heading"><div><span className="eyebrow">FILE DE TRAVAIL</span><h3>Prompts préparés</h3></div><span className="count-badge">{jobs.length}</span></div>{jobs.length===0?<EmptyState icon={ImagePlus} title="Ton studio est prêt" text="Tes prompts préparés apparaîtront ici."/>:jobs.map(j=><JobRow key={j.id} job={j}/>)}</div></div>}
function VideoStudio({value,setValue,add,jobs}:{value:string;setValue:(s:string)=>void;add:(k:'Image'|'Vidéo',v:string)=>void;jobs:PromptJob[]}) {return <div className="studio-layout"><div className="panel generator-panel"><div className="panel-title"><span className="large-icon"><Clapperboard size={21}/></span><div><h2>Video studio</h2><p>Prépare plusieurs scènes en une fois.</p></div></div><label className="field-label">UN PROMPT PAR LIGNE</label><textarea className="prompt-area batch-area" value={value} onChange={e=>setValue(e.target.value)} placeholder={'Scène 1 : une rose en cristal tourne dans une lumière rouge...\nScène 2 : travelling sur un décor champagne et chrome...\nScène 3 : gros plan cinématique sur des diamants...'} rows={8}/><div className="prompt-hint"><Layers3 size={13}/> Chaque ligne non vide devient une tâche distincte.</div><button className="primary-button full" onClick={()=>add('Vidéo',value)}><Plus size={17}/> Préparer les vidéos</button><p className="disclaimer">Les tâches sont enregistrées localement dans cette session. Le rendu vidéo sera activé après intégration d'un moteur compatible.</p></div><div className="panel queue-panel"><div className="queue-heading"><div><span className="eyebrow">FILE VIDÉO</span><h3>Scènes préparées</h3></div><span className="count-badge">{jobs.length}</span></div>{jobs.length===0?<EmptyState icon={Film} title="Ton prochain film commence ici" text="Ajoute plusieurs prompts pour préparer un lot."/>:jobs.map(j=><JobRow key={j.id} job={j}/>)}</div></div>}
function JobRow({job}:{job:PromptJob}) {return <div className="job-row"><span className="job-icon">{job.kind==='Image'?<ImagePlus size={16}/>:<Film size={16}/>}</span><div className="job-copy"><b>{job.kind} · brouillon</b><p>{job.prompt}</p></div><span className="draft-pill">À lancer</span></div>}
function EmptyState({icon:Icon,title,text}:{icon:typeof Sparkles;title:string;text:string}) {return <div className="empty-state"><span><Icon size={24}/></span><b>{title}</b><p>{text}</p></div>}
function Library({jobs}:{jobs:PromptJob[]}) {return <div className="panel library-panel"><div className="panel-title"><span className="large-icon"><FolderHeart size={21}/></span><div><h2>Ta bibliothèque</h2><p>Tous tes projets au même endroit.</p></div></div>{jobs.length===0?<EmptyState icon={FolderHeart} title="Ta galerie est encore vide" text="Les prompts préparés seront listés ici. Les fichiers générés seront ajoutés après connexion des moteurs."/>:<>{jobs.map(j=><JobRow key={j.id} job={j}/>)}</>}</div>}
function Agents() {const agents=[['Muse','Direction artistique et idées créatives',Sparkles],['Orion','Recherche et synthèse documentaire',Search],['Pixel','Préparation de prompts visuels',ImagePlus],['Atlas','Organisation et automatisation',Workflow],['Dev','Assistance au développement',Code2]] as const;return <div className="agents-grid">{agents.map(([name,desc,Icon])=><div className="agent-card" key={name}><span className="agent-icon"><Icon size={20}/></span><div><b>{name}</b><p>{desc}</p></div><span className="coming-soon">À CONNECTER</span></div>)}<div className="prototype-note wide"><CircleHelp size={16}/><span>Ces profils définissent l'organisation future des agents. Ils ne sont pas encore reliés à des modèles autonomes.</span></div></div>}
export default App;
