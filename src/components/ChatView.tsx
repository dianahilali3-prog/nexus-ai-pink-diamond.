import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown, Copy, FileText, Globe, History, ImagePlus, Loader2, MessageSquarePlus, Mic, MicOff, Paperclip, RefreshCw,
  Send, Square, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX, X, Headphones, Wand2, ChevronDown
} from 'lucide-react';
import { BUILTIN_AGENTS } from '../lib/agents';
import { readDocument, readImage, relevantPassages, DOC_ACCEPT, IMG_ACCEPT } from '../lib/documents';
import {
  buildSystemPrompt, detectImageRequest, extractMemory, hideStreamingTags, learnFromFeedback, makeTitle, rememberAll, toWire
} from '../lib/engine';
import { enhancePrompt, generateImage, SIZES } from '../lib/images';
import { renderMarkdown } from '../lib/markdown';
import { activeProviders, PROVIDERS, streamChat, supportsVision } from '../lib/providers';
import { getSettings, useSettings } from '../lib/settings';
import { capabilities, ensureMic, listen, speak, stopSpeaking, sttAvailable, type Listener } from '../lib/speech';
import { addToGallery, deleteConversation, listConversations, listMemory, saveConversation, uid } from '../lib/storage';
import type { Agent, Attachment, ChatMessage, Conversation, Source } from '../lib/types';
import { gatherWebContext, URL_RE } from '../lib/web';
import { GalleryImage } from './GalleryImage';
import { AGENT_ICON, AiDisclaimer, copyText, formatDate, go, Modal, Portal, setIntent, takeIntent, toast } from './ui';

export function loadCustomAgents(): Agent[] {
  try {
    return JSON.parse(localStorage.getItem('nexus.agents') || '[]') as Agent[];
  } catch {
    return [];
  }
}

const newConversation = (agentId = 'nexus'): Conversation => ({
  id: uid(), title: 'Nouvelle conversation', agentId, messages: [], createdAt: Date.now(), updatedAt: Date.now()
});

type VoiceState = 'off' | 'listening' | 'thinking' | 'speaking';

export default function ChatView() {
  const settings = useSettings();
  const agents = useMemo(() => [...BUILTIN_AGENTS, ...loadCustomAgents()], []);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [conv, setConv] = useState<Conversation>(() => newConversation());
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [thinking, setThinking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [agentPicker, setAgentPicker] = useState(false);
  const [webOn, setWebOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState<VoiceState>('off');
  const [level, setLevel] = useState(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<ChatMessage | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const voiceRef = useRef<VoiceState>('off');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const convRef = useRef(conv);
  const selectConv = (c: Conversation) => { convRef.current = c; setConv(c); };

  const agent = agents.find(a => a.id === conv.agentId) ?? agents[0];
  const AgentIcon = AGENT_ICON[agent.icon] ?? AGENT_ICON.gem;
  const providers = activeProviders(settings);

  /* ---------- Chargement & intentions ---------- */
  useEffect(() => {
    (async () => {
      const list = await listConversations();
      setConvs(list);
      const i = takeIntent('chat');
      if (i?.conversationId) {
        const c = list.find(x => x.id === i.conversationId);
        if (c) selectConv(c);
      } else if (i) {
        const c = newConversation(i.agentId ?? 'nexus');
        selectConv(c);
        setWebOn(!!agents.find(a => a.id === c.agentId)?.web);
        if (i.prompt) setInput(i.prompt);
      } else {
        const lastId = localStorage.getItem('nexus.lastConversation');
        const last = list.find(x => x.id === lastId) ?? list[0];
        if (last && Date.now() - last.updatedAt < 1000 * 60 * 60 * 12) selectConv(last);
      }
    })();
    return () => {
      abortRef.current?.abort();
      listenerRef.current?.abort();
      stopSpeaking();
    };
  }, [agents]);

  useEffect(() => { localStorage.setItem('nexus.lastConversation', conv.id); }, [conv.id]);

  const persist = useCallback(async (c: Conversation) => {
    if (!c.messages.length) return;
    await saveConversation(c);
    setConvs(await listConversations());
  }, []);

  // Mise à jour synchrone : convRef reste toujours la source de vérité.
  const update = useCallback((fn: (c: Conversation) => Conversation, save = false) => {
    const next = fn(convRef.current);
    convRef.current = next;
    setConv(next);
    if (save) void persist(next);
  }, [persist]);

  /* ---------- Défilement ---------- */
  const scrollDown = useCallback((smooth = true) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useEffect(() => { if (atBottom) scrollDown(false); }, [conv.messages, atBottom, scrollDown]);

  /* ---------- Pièces jointes ---------- */
  const addFiles = async (files: FileList | null, kind: 'doc' | 'img') => {
    if (!files?.length) return;
    for (const f of Array.from(files).slice(0, 5)) {
      try {
        setStatus(`Lecture de « ${f.name} »…`);
        const att = kind === 'img' || f.type.startsWith('image/') ? await readImage(f) : await readDocument(f, p => setStatus(`Lecture de « ${f.name} »… ${Math.round(p * 100)} %`));
        setPending(p => [...p, att]);
        if (att.kind === 'document') toast(`« ${f.name} » lu : ${att.chars.toLocaleString('fr-FR')} caractères.`);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Fichier illisible.', 'error', 6000);
      }
    }
    setStatus('');
  };

  /* ---------- Envoi ---------- */
  const runAssistant = useCallback(
    async (base: Conversation, userMsg: ChatMessage): Promise<string | null> => {
      const s = getSettings();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setThinking(false);
      const asstId = uid();
      const asst: ChatMessage = { id: asstId, role: 'assistant', content: '', createdAt: Date.now(), notes: [] };
      update(() => ({ ...base, messages: [...base.messages, asst], updatedAt: Date.now() }));
      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        update(c => ({ ...c, messages: c.messages.map(m => (m.id === asstId ? fn(m) : m)) }));
      const note = (t: string) => patch(m => ({ ...m, notes: [...(m.notes ?? []), t] }));
      const history = base.messages.filter(m => m.id !== userMsg.id);

      try {
        /* -- Image demandée directement dans le chat -- */
        const imgReq = detectImageRequest(userMsg.content);
        if (imgReq) {
          let prompt = imgReq;
          if (s.image.autoEnhance) {
            setStatus('Amélioration du prompt…');
            try { prompt = await enhancePrompt(imgReq, '', ctrl.signal); } catch { /* on garde l’idée brute */ }
          }
          const size = SIZES[s.image.size];
          const r = await generateImage(prompt, { width: size.w, height: size.h, signal: ctrl.signal, onStatus: setStatus });
          const item = await addToGallery(r.blob, { kind: 'image', prompt, source: r.engine, width: r.width, height: r.height });
          const text = `Voici ton image ✨\n\n**Prompt utilisé** (${r.engine}) :\n\n> ${prompt}\n\nElle est enregistrée dans ta galerie. Tu peux demander une variante ou l’ouvrir dans le Studio Image.`;
          patch(m => ({ ...m, content: text, images: [item.id], provider: r.engine }));
          const final = { ...convRef.current };
          await persist(final);
          return text;
        }

        /* -- Contexte : documents, web, images -- */
        const allAtt = [...history.flatMap(m => m.attachments ?? []), ...(userMsg.attachments ?? [])];
        const docs = allAtt.filter(a => a.kind === 'document');
        const docText = docs.length ? relevantPassages(docs, userMsg.content) : undefined;
        let webText: string | undefined;
        let sources: Source[] = [];
        const wantWeb = webOn || agent.web || (s.web.readLinks && URL_RE.test(userMsg.content));
        URL_RE.lastIndex = 0;
        if (wantWeb) {
          setStatus(webOn || agent.web ? 'Recherche sur le web…' : 'Lecture du lien…');
          const ctx = await gatherWebContext(userMsg.content, { search: webOn || !!agent.web });
          webText = ctx.text || undefined;
          sources = ctx.sources;
          ctx.notes.forEach(note);
        }
        const imgs = (userMsg.attachments ?? []).filter(a => a.kind === 'image');
        const first = activeProviders(s)[0];
        const vision = first ? supportsVision(first, s.models[first]) : false;
        const captions: string[] = [];
        if (imgs.length && !vision) {
          setStatus('Description de l’image sur ton appareil (premier usage : téléchargement ~250 Mo)…');
          const { captionLocal } = await import('../lib/localllm');
          for (const im of imgs) {
            try {
              captions.push(`${im.name} : ${await captionLocal(im.dataUrl!, p => p.file && setStatus(`Téléchargement du modèle de description… ${Math.round(p.progress)} %`))}`);
            } catch (e) {
              note(`Description d’image impossible : ${e instanceof Error ? e.message : e}`);
            }
          }
        }
        const memory = s.memoryEnabled ? await listMemory() : [];
        const system = buildSystemPrompt(agent, memory, { docs: docText, web: webText, images: captions });
        const wire = toWire(system, history, { text: userMsg.content, images: vision ? imgs.map(i => i.dataUrl!) : [] });

        setStatus('');
        let acc = '';
        let raf = 0;
        const flush = () => { raf = 0; const shown = hideStreamingTags(acc); patch(m => ({ ...m, content: shown })); };
        const res = await streamChat(wire, { signal: ctrl.signal }, {
          onToken: t => { acc += t; setThinking(false); if (!raf) raf = requestAnimationFrame(flush); },
          onReasoning: () => setThinking(true),
          onProvider: (id, model) => patch(m => ({ ...m, provider: PROVIDERS[id].short, model })),
          onNote: note
        });
        if (raf) cancelAnimationFrame(raf);
        const { clean, found } = extractMemory(res.text);
        patch(m => ({ ...m, content: clean, sources: sources.length ? sources : undefined }));
        if (found.length && s.memoryEnabled) {
          const saved = await rememberAll(found);
          if (saved.length) toast(`NEXUS a retenu : ${saved.join(' · ')}`, 'info', 5000);
        }
        const final = { ...convRef.current };
        if (final.title === 'Nouvelle conversation' && final.messages.filter(m => m.role === 'user').length === 1) {
          final.title = userMsg.content.slice(0, 40) || 'Conversation';
          void makeTitle(userMsg.content).then(t => {
            if (!t) return;
            update(c => (c.id === final.id ? { ...c, title: t } : c), true);
          });
        }
        update(() => final, true);
        return clean;
      } catch (e) {
        const aborted = (e as Error)?.name === 'AbortError' || ctrl.signal.aborted;
        if (aborted) {
          patch(m => ({ ...m, content: m.content ? `${m.content}\n\n*— arrêté —*` : '*Réponse arrêtée.*' }));
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          patch(m => ({
            ...m,
            error: true,
            content: `**Je n’ai pas pu répondre.**\n\n${msg.split('\n').map(l => `- ${l}`).join('\n')}\n\nVérifie ta connexion, réessaie dans un instant, ou active un autre fournisseur dans **Réglages → Fournisseurs**.`
          }));
        }
        await persist(convRef.current);
        return null;
      } finally {
        setBusy(false);
        setThinking(false);
        setStatus('');
        abortRef.current = null;
      }
    },
    [agent, persist, update, webOn]
  );

  const send = useCallback(
    async (textArg?: string) => {
      const text = (textArg ?? input).trim();
      if ((!text && !pending.length) || busy) return;
      const userMsg: ChatMessage = {
        id: uid(), role: 'user', createdAt: Date.now(),
        content: text || (pending.some(p => p.kind === 'image') ? 'Décris cette image.' : 'Résume ce document.'),
        attachments: pending.length ? pending : undefined
      };
      const base = { ...convRef.current, messages: [...convRef.current.messages, userMsg], updatedAt: Date.now(), webSearch: webOn };
      setInput('');
      setPending([]);
      setAtBottom(true);
      update(() => base);
      const answer = await runAssistant(base, userMsg);
      const s = getSettings();
      if (answer && (voiceRef.current !== 'off' || s.voice.autoSpeak)) {
        if (voiceRef.current !== 'off') { voiceRef.current = 'speaking'; setVoice('speaking'); }
        await speakMessage(answer);
      }
      if (voiceRef.current !== 'off') startVoiceTurn();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, pending, busy, runAssistant, update, webOn]
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  const regenerate = async () => {
    if (busy) return;
    const msgs = convRef.current.messages;
    const lastUserIdx = msgs.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return;
    const base = { ...convRef.current, messages: msgs.slice(0, lastUserIdx + 1) };
    update(() => base);
    await runAssistant(base, msgs[lastUserIdx]);
  };

  const stop = () => {
    abortRef.current?.abort();
    stopSpeaking();
    setSpeakingId(null);
  };

  /* ---------- Voix ---------- */
  async function speakMessage(text: string, id?: string) {
    setSpeakingId(id ?? 'auto');
    try {
      await speak(text, t => setStatus(t));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lecture impossible.', 'error');
    } finally {
      setSpeakingId(null);
      setStatus('');
    }
  }

  const toggleSpeak = (m: ChatMessage) => {
    if (speakingId === m.id) { stopSpeaking(); setSpeakingId(null); return; }
    void speakMessage(m.content, m.id);
  };

  const dictate = async () => {
    if (listening) { listenerRef.current?.stop(); return; }
    if (!sttAvailable()) {
      toast(capabilities.browserSTT ? 'Micro indisponible.' : 'Reconnaissance vocale absente de ce navigateur. Active Whisper dans Réglages → Voix.', 'error', 6000);
      return;
    }
    stopSpeaking();
    const prefix = input ? `${input.trim()} ` : '';
    setListening(true);
    listenerRef.current = listen({
      onInterim: t => setInput(prefix + t),
      onFinal: t => setInput(prefix + t),
      onError: m => toast(m, 'error', 6000),
      onEnd: () => { setListening(false); setLevel(0); setStatus(''); inputRef.current?.focus(); },
      onLevel: setLevel,
      onStatus: setStatus
    });
  };

  function startVoiceTurn() {
    if (voiceRef.current === 'off') return;
    voiceRef.current = 'listening';
    setVoice('listening');
    let heard = '';
    listenerRef.current = listen({
      onInterim: t => { heard = t; setInput(t); },
      onFinal: t => { heard = t; },
      onError: m => { if (!/rien entendu/.test(m)) toast(m, 'error', 6000); },
      onLevel: setLevel,
      onStatus: setStatus,
      onEnd: () => {
        setLevel(0);
        if (voiceRef.current === 'off') return;
        if (heard.trim()) {
          voiceRef.current = 'thinking';
          setVoice('thinking');
          void sendRef.current(heard);
        } else {
          // Silence : on réécoute une fois, puis on met en pause.
          voiceRef.current = 'off';
          setVoice('off');
          toast('Mode vocal en pause (aucune parole détectée).', 'info');
        }
      }
    });
  }

  const startHandsFree = async () => {
    if (!sttAvailable()) {
      toast('La reconnaissance vocale n’est pas disponible ici. Essaie Chrome/Safari récent, ou Whisper dans Réglages → Voix.', 'error', 7000);
      return;
    }
    const err = await ensureMic();
    if (err) { toast(err, 'error', 7000); return; }
    if (capabilities.browserTTS) { const u = new SpeechSynthesisUtterance(''); speechSynthesis.speak(u); } // débloque l’audio sur iOS
    voiceRef.current = 'listening';
    startVoiceTurn();
  };

  const stopHandsFree = () => {
    voiceRef.current = 'off';
    setVoice('off');
    listenerRef.current?.abort();
    abortRef.current?.abort();
    stopSpeaking();
    setLevel(0);
  };

  /* ---------- Conversations ---------- */
  const startNew = (agentId = conv.agentId) => {
    stop();
    const c = newConversation(agentId);
    selectConv(c);
    setWebOn(!!agents.find(a => a.id === agentId)?.web);
    setHistoryOpen(false);
    setAgentPicker(false);
    setPending([]);
    inputRef.current?.focus();
  };

  const chooseAgent = (a: Agent) => {
    if (conv.messages.length) startNew(a.id);
    else { update(c => ({ ...c, agentId: a.id })); setWebOn(!!a.web); setAgentPicker(false); }
  };

  const removeConv = async (id: string) => {
    await deleteConversation(id);
    setConvs(await listConversations());
    if (id === conv.id) startNew();
  };

  /* ---------- Retours (apprentissage) ---------- */
  const rate = async (m: ChatMessage, v: 'up' | 'down') => {
    update(c => ({ ...c, messages: c.messages.map(x => (x.id === m.id ? { ...x, feedback: x.feedback === v ? undefined : v } : x)) }), true);
    if (v === 'down' && getSettings().memoryEnabled) setFeedbackFor(m);
    else if (v === 'up') toast('Merci ! Retour enregistré sur ton appareil.');
  };

  const submitLesson = async (comment: string) => {
    const m = feedbackFor;
    setFeedbackFor(null);
    if (!m) return;
    const idx = conv.messages.findIndex(x => x.id === m.id);
    const q = conv.messages.slice(0, idx).reverse().find(x => x.role === 'user')?.content ?? '';
    try {
      const lesson = await learnFromFeedback(q, m.content, comment);
      toast(lesson ? `Leçon retenue : « ${lesson} »` : 'Retour noté.', 'info', 6000);
    } catch {
      toast('Retour noté (leçon non générée : service indisponible).', 'info');
    }
  };

  /* ---------- Copie des blocs de code ---------- */
  const onBubbleClick = (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('[data-copy]');
    if (!btn) return;
    const code = btn.closest('.code-block')?.querySelector('code')?.textContent ?? '';
    void copyText(code);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      void send();
    }
  };

  // Ajuste la hauteur du champ de saisie.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [input]);

  const lastAssistant = [...conv.messages].reverse().find(m => m.role === 'assistant');
  const docCount = conv.messages.flatMap(m => m.attachments ?? []).filter(a => a.kind === 'document').length;

  return (
    <div className="chat-layout">
      {/* Historique */}
      <aside className={`history ${historyOpen ? 'open' : ''}`} aria-label="Conversations">
        <div className="history-head">
          <b>Conversations</b>
          <button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="Fermer l’historique"><X size={18} /></button>
        </div>
        <button className="primary-button full" onClick={() => startNew()}><MessageSquarePlus size={17} /> Nouvelle conversation</button>
        <div className="history-list">
          {convs.length === 0 && <p className="muted-text">Tes conversations apparaîtront ici.</p>}
          {convs.map(c => (
            <div key={c.id} className={`history-item ${c.id === conv.id ? 'active' : ''}`}>
              <button onClick={() => { stop(); selectConv(c); setHistoryOpen(false); setWebOn(!!c.webSearch); }}>
                <b>{c.title}</b>
                <small>{agents.find(a => a.id === c.agentId)?.name ?? 'NEXUS'} · {formatDate(c.updatedAt)} · {c.messages.length} msg</small>
              </button>
              <button className="icon-button small" onClick={() => removeConv(c.id)} aria-label={`Supprimer « ${c.title} »`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </aside>
      {historyOpen && <div className="history-scrim" onClick={() => setHistoryOpen(false)} />}

      <section className="panel chat-panel">
        <header className="chat-head">
          <button className="icon-button" onClick={() => setHistoryOpen(true)} aria-label="Ouvrir l’historique des conversations"><History size={18} /></button>
          <button className="agent-switch" onClick={() => setAgentPicker(true)} aria-label={`Agent actuel : ${agent.name}. Changer d’agent`}>
            <span className="assistant-avatar"><AgentIcon size={18} /></span>
            <span className="agent-switch-text">
              <b>{agent.name} <ChevronDown size={14} /></b>
              <small>
                <i className={`live-dot ${providers.length ? 'on' : ''}`} />
                {busy ? (thinking ? 'réfléchit…' : 'écrit…') : providers.length ? PROVIDERS[providers[0]].short : 'aucun fournisseur actif'}
              </small>
            </span>
          </button>
          <div className="chat-head-actions">
            <button className="icon-button" onClick={voice === 'off' ? startHandsFree : stopHandsFree} aria-label="Conversation vocale mains libres" title="Conversation vocale mains libres">
              <Headphones size={18} />
            </button>
            <button className="icon-button" onClick={() => startNew()} aria-label="Nouvelle conversation"><MessageSquarePlus size={18} /></button>
          </div>
        </header>

        <div className="chat-messages" ref={listRef} onClick={onBubbleClick} onScroll={e => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}>
          {conv.messages.length === 0 && (
            <div className="chat-welcome">
              <motion.div className="welcome-gem" animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.04, 1] }} transition={{ duration: 6, repeat: Infinity }}>
                <AgentIcon size={34} />
              </motion.div>
              <h2>Bonjour, je suis {agent.name}.</h2>
              <p>{agent.tagline}. Écris, parle <Mic size={13} aria-hidden />, importe un document <Paperclip size={13} aria-hidden /> ou demande une image avec <code>/image …</code></p>
              <div className="starter-grid">
                {(agent.starter ?? []).map(s => (
                  <button key={s} className="starter" onClick={() => void send(s)}>{s}</button>
                ))}
                <button className="starter" onClick={() => void send('/image un diamant rose posé sur du velours, lumière de studio')}>/image un diamant rose sur du velours</button>
              </div>
            </div>
          )}

          {conv.messages.map((m, i) => {
            const isLast = m.id === lastAssistant?.id;
            const streaming = busy && isLast && i === conv.messages.length - 1;
            return (
              <motion.article key={m.id} className={`message ${m.role} ${m.error ? 'error' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className="message-avatar" aria-hidden>{m.role === 'assistant' ? <AgentIcon size={14} /> : 'Moi'}</div>
                <div className="message-body">
                  {m.attachments && (
                    <div className="att-row">
                      {m.attachments.map(a => (
                        a.kind === 'image' && a.dataUrl
                          ? <img key={a.id} src={a.dataUrl} alt={a.name} className="att-thumb" />
                          : <span key={a.id} className="chip"><FileText size={13} /> {a.name}</span>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' ? (
                    <div className={`message-bubble md ${streaming ? 'streaming' : ''}`}>
                      {m.content ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} /> : (
                        <div className="typing" aria-label="NEXUS prépare sa réponse"><span /><span /><span />
                          <em>{status || (thinking ? 'Réflexion…' : 'Connexion…')}</em>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="message-bubble">{m.content}</div>
                  )}
                  {m.images?.map(id => <GalleryImage key={id} id={id} />)}
                  {m.sources && (
                    <div className="sources">
                      <b>Sources</b>
                      {m.sources.map((s, k) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">[{k + 1}] {s.title}</a>
                      ))}
                    </div>
                  )}
                  {m.notes && m.notes.length > 0 && <div className="notes">{m.notes.map((n, k) => <small key={k}>{n}</small>)}</div>}
                  {!streaming && (
                    <div className="message-actions">
                      <button onClick={() => copyText(m.content)} aria-label="Copier le message"><Copy size={14} /></button>
                      {m.role === 'assistant' && !m.error && (
                        <button onClick={() => toggleSpeak(m)} aria-label={speakingId === m.id ? 'Arrêter la lecture' : 'Écouter la réponse'}>
                          {speakingId === m.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      )}
                      {m.role === 'assistant' && isLast && <button onClick={regenerate} aria-label="Régénérer la réponse"><RefreshCw size={14} /></button>}
                      {m.role === 'assistant' && !m.error && <>
                        <button className={m.feedback === 'up' ? 'on' : ''} onClick={() => rate(m, 'up')} aria-label="Bonne réponse"><ThumbsUp size={14} /></button>
                        <button className={m.feedback === 'down' ? 'on' : ''} onClick={() => rate(m, 'down')} aria-label="Mauvaise réponse"><ThumbsDown size={14} /></button>
                      </>}
                      {m.role === 'user' && <button onClick={() => { setIntent({ type: 'image', prompt: m.content }); go('images'); }} aria-label="Créer une image à partir de ce message"><ImagePlus size={14} /></button>}
                      {m.role === 'assistant' && m.provider && <span className="provider-tag">{m.provider}{m.model && m.model !== 'openai' ? ` · ${m.model.split('/').pop()}` : ''}</span>}
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>

        {!atBottom && conv.messages.length > 2 && (
          <button className="scroll-down" onClick={() => { setAtBottom(true); scrollDown(); }} aria-label="Aller au dernier message"><ArrowDown size={16} /></button>
        )}

        <div className="chat-compose">
          {pending.length > 0 && (
            <div className="att-row pending">
              {pending.map(a => (
                <span key={a.id} className="chip">
                  {a.kind === 'image' ? <img src={a.dataUrl} alt="" className="chip-thumb" /> : <FileText size={13} />}
                  {a.name}{a.kind === 'document' && <small> · {Math.round(a.chars / 1000)}k car.</small>}
                  <button onClick={() => setPending(p => p.filter(x => x.id !== a.id))} aria-label={`Retirer ${a.name}`}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          {status && <div className="compose-status"><Loader2 size={13} className="spin" /> {status}</div>}
          <label className="sr-only" htmlFor="chat-input">Message pour {agent.name}</label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={listening ? 'Je t’écoute…' : `Écris à ${agent.name}…`}
            rows={1}
            enterKeyHint="send"
          />
          <div className="compose-bottom">
            <div className="compose-tools">
              <button className="tool" onClick={() => fileRef.current?.click()} aria-label="Importer un document (PDF, Word, texte)" title="Document"><Paperclip size={17} /></button>
              <button className="tool" onClick={() => imgRef.current?.click()} aria-label="Joindre une image à décrire" title="Image"><ImagePlus size={17} /></button>
              <button className={`tool ${webOn ? 'on' : ''}`} onClick={() => setWebOn(v => !v)} aria-pressed={webOn} aria-label="Recherche web" title="Recherche web (Wikipédia)"><Globe size={17} /></button>
              <button className="tool" onClick={() => setInput(v => (v.startsWith('/image') ? v : `/image ${v}`))} aria-label="Demander une image" title="/image"><Wand2 size={17} /></button>
              <button className={`tool mic ${listening ? 'live' : ''}`} onClick={dictate} aria-label={listening ? 'Arrêter la dictée' : 'Dicter un message'} style={{ ['--lvl' as string]: level }}>
                {listening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              {docCount > 0 && <span className="doc-badge" title="Documents disponibles dans cette conversation"><FileText size={12} /> {docCount}</span>}
            </div>
            {busy || speakingId ? (
              <button className="send-button stop" onClick={stop} aria-label="Arrêter"><Square size={16} /></button>
            ) : (
              <button className="send-button" onClick={() => void send()} disabled={!input.trim() && !pending.length} aria-label="Envoyer"><Send size={17} /></button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={DOC_ACCEPT} multiple hidden onChange={e => { void addFiles(e.target.files, 'doc'); e.target.value = ''; }} />
          <input ref={imgRef} type="file" accept={IMG_ACCEPT} multiple hidden onChange={e => { void addFiles(e.target.files, 'img'); e.target.value = ''; }} />
        </div>
        <AiDisclaimer compact />
      </section>

      {/* Choix de l’agent */}
      <Modal open={agentPicker} onClose={() => setAgentPicker(false)} title="Choisir un agent">
        <div className="agent-pick-list">
          {agents.map(a => {
            const Icon = AGENT_ICON[a.icon] ?? AGENT_ICON.gem;
            return (
              <button key={a.id} className={`agent-pick ${a.id === agent.id ? 'active' : ''}`} onClick={() => chooseAgent(a)}>
                <span className="agent-icon"><Icon size={18} /></span>
                <span><b>{a.name}</b><small>{a.tagline}</small></span>
              </button>
            );
          })}
        </div>
        <button className="secondary-button full" onClick={() => { setAgentPicker(false); go('agents'); }}>Gérer les agents</button>
      </Modal>

      {/* Retour négatif → leçon */}
      <FeedbackModal message={feedbackFor} onClose={() => setFeedbackFor(null)} onSubmit={submitLesson} />

      {/* Mode vocal mains libres */}
      <Portal>
      <AnimatePresence>
        {voice !== 'off' && (
          <motion.div className="voice-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Conversation vocale">
            <div className="voice-orb-wrap">
              <motion.div
                className={`voice-orb ${voice}`}
                animate={{ scale: voice === 'listening' ? 1 + level * 0.5 : voice === 'speaking' ? [1, 1.08, 1] : [1, 0.96, 1] }}
                transition={voice === 'listening' ? { duration: 0.08 } : { duration: 1.4, repeat: Infinity }}
              />
            </div>
            <p className="voice-state">{voice === 'listening' ? 'Je t’écoute…' : voice === 'thinking' ? 'Je réfléchis…' : 'Je te réponds…'}</p>
            <p className="voice-heard">{voice === 'listening' ? input : status}</p>
            <div className="voice-actions">
              {voice === 'speaking' && <button className="secondary-button" onClick={() => { stopSpeaking(); }}>Passer</button>}
              <button className="primary-button" onClick={stopHandsFree}><Square size={16} /> Terminer</button>
            </div>
            <small className="voice-hint">Parle naturellement : NEXUS écoute, répond, puis réécoute. {getSettings().voice.sttEngine === 'browser' && 'La reconnaissance du navigateur peut envoyer l’audio à Google (Chrome) ou Apple (Safari).'}</small>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>
    </div>
  );
}

function FeedbackModal({ message, onClose, onSubmit }: { message: ChatMessage | null; onClose: () => void; onSubmit: (c: string) => void }) {
  const [comment, setComment] = useState('');
  useEffect(() => setComment(''), [message]);
  return (
    <Modal open={!!message} onClose={onClose} title="Aider NEXUS à s’améliorer">
      <p className="muted-text">Dis en quelques mots ce qui n’allait pas. NEXUS en tirera une consigne enregistrée sur ton appareil (Réglages → Mémoire) et l’appliquera aux prochaines réponses.</p>
      <label className="field-label" htmlFor="fb">Ton commentaire (facultatif)</label>
      <textarea id="fb" className="settings-input" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Ex. : trop long, pas assez précis, mauvais ton…" />
      <div className="row-actions">
        <button className="secondary-button" onClick={onClose}>Annuler</button>
        <button className="primary-button" onClick={() => onSubmit(comment)}>Enregistrer la leçon</button>
      </div>
    </Modal>
  );
}
