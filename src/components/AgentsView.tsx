import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Globe, Info, Plus, Trash2 } from 'lucide-react';
import { AGENT_ICONS, BUILTIN_AGENTS } from '../lib/agents';
import type { Agent } from '../lib/types';
import { loadCustomAgents } from './ChatView';
import { AGENT_ICON, go, Modal, setIntent, toast } from './ui';

export default function AgentsView() {
  const [custom, setCustom] = useState<Agent[]>(loadCustomAgents);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', tagline: '', instructions: '', icon: 'star', web: false });

  const saveCustom = (list: Agent[]) => {
    setCustom(list);
    localStorage.setItem('nexus.agents', JSON.stringify(list));
  };
  const start = (a: Agent, prompt?: string) => {
    setIntent({ type: 'chat', agentId: a.id, newChat: true, prompt });
    go('chat');
  };
  const create = () => {
    if (!draft.name.trim() || draft.instructions.trim().length < 15) { toast('Donne un nom et des consignes (au moins une phrase).', 'info'); return; }
    const a: Agent = { id: `custom-${Date.now()}`, name: draft.name.trim().slice(0, 30), tagline: draft.tagline.trim() || 'Agent personnalisé', icon: draft.icon, instructions: draft.instructions.trim().slice(0, 4000), web: draft.web, custom: true };
    saveCustom([...custom, a]);
    setEditing(false);
    setDraft({ name: '', tagline: '', instructions: '', icon: 'star', web: false });
    toast(`Agent « ${a.name} » créé.`);
  };

  return (
    <>
      <div className="prototype-note">
        <Info size={16} />
        <span>Les agents sont des <b>assistants spécialisés</b> : chacun reçoit des consignes précises et, selon le cas, des outils légers (recherche Wikipédia, lecture de liens et de documents). Ils répondent dans le chat ; ils n’agissent pas seuls en dehors de l’application.</span>
      </div>
      <div className="agents-grid">
        {[...BUILTIN_AGENTS, ...custom].map((a, i) => {
          const Icon = AGENT_ICON[a.icon] ?? AGENT_ICON.gem;
          return (
            <motion.article className="agent-card" key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="agent-top">
                <span className="agent-icon"><Icon size={20} /></span>
                <div><b>{a.name}</b><p>{a.tagline}</p></div>
                {a.web && <span className="tool-pill"><Globe size={12} /> Web</span>}
              </div>
              {a.starter && (
                <div className="agent-starters">
                  {a.starter.slice(0, 2).map(s => <button key={s} onClick={() => start(a, s)}>{s}</button>)}
                </div>
              )}
              <div className="row-actions">
                <button className="primary-button" onClick={() => start(a)}>Discuter <ArrowRight size={15} /></button>
                {a.custom && <button className="icon-button" onClick={() => saveCustom(custom.filter(c => c.id !== a.id))} aria-label={`Supprimer l’agent ${a.name}`}><Trash2 size={16} /></button>}
              </div>
            </motion.article>
          );
        })}
        <button className="agent-card add-agent" onClick={() => setEditing(true)}>
          <span className="agent-icon"><Plus size={20} /></span>
          <b>Créer mon agent</b>
          <p>Donne-lui un nom et des consignes.</p>
        </button>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Nouvel agent">
        <label className="field-label" htmlFor="an">Nom</label>
        <input id="an" className="settings-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex. : Coach" />
        <label className="field-label" htmlFor="at">Description courte</label>
        <input id="at" className="settings-input" value={draft.tagline} onChange={e => setDraft({ ...draft, tagline: e.target.value })} placeholder="Ex. : Motivation et sport" />
        <label className="field-label" htmlFor="ai">Consignes</label>
        <textarea id="ai" className="settings-input" rows={5} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} placeholder="Ex. : Tu es un coach sportif bienveillant. Tu proposes des séances de 20 minutes sans matériel…" />
        <span className="field-label">Icône</span>
        <div className="chip-select">
          {AGENT_ICONS.map(ic => { const I = AGENT_ICON[ic]; return <button key={ic} className={draft.icon === ic ? 'on' : ''} onClick={() => setDraft({ ...draft, icon: ic })} aria-label={ic}><I size={16} /></button>; })}
        </div>
        <label className="toggle-inline"><input type="checkbox" checked={draft.web} onChange={e => setDraft({ ...draft, web: e.target.checked })} /> Recherche web activée par défaut</label>
        <div className="row-actions">
          <button className="secondary-button" onClick={() => setEditing(false)}>Annuler</button>
          <button className="primary-button" onClick={create}>Créer</button>
        </div>
      </Modal>
    </>
  );
}
