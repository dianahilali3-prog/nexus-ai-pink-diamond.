import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Brain, CheckCircle2, Cpu, Database, Download, ExternalLink, Eye, EyeOff, Globe, Image as ImageIcon, KeyRound,
  Loader2, Mic, Plug, Smartphone, Trash2, Upload, Volume2, XCircle
} from 'lucide-react';
import { LOCAL_MODELS, listModels, PROVIDERS, quickChat } from '../lib/providers';
import { setSettings, useSettings, resetSettings, type ProviderId } from '../lib/settings';
import { capabilities, getVoices, LANGS, onVoicesChanged, PIPER_VOICES, speak, stopSpeaking, WHISPER_MODELS } from '../lib/speech';
import { addMemory, deleteMemory, exportAll, importAll, listMemory, wipeEverything } from '../lib/storage';
import type { MemoryItem } from '../lib/types';
import { go, Progress, toast, Toggle } from './ui';

function Section({ icon: Icon, title, children, id }: { icon: typeof Plug; title: string; children: ReactNode; id?: string }) {
  return (
    <section className="panel settings-section" id={id}>
      <h2 className="settings-title"><Icon size={18} /> {title}</h2>
      {children}
    </section>
  );
}

function KeyInput({ field, label }: { field: keyof ReturnType<typeof useSettings>['keys']; label: string }) {
  const s = useSettings();
  const [show, setShow] = useState(false);
  return (
    <>
      <label className="field-label" htmlFor={`key-${field}`}>{label}</label>
      <div className="input-with-button">
        <input
          id={`key-${field}`}
          className="settings-input"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={s.keys[field]}
          onChange={e => setSettings(x => ({ ...x, keys: { ...x.keys, [field]: e.target.value.trim() } }))}
          placeholder="Colle ta clé ici"
        />
        <button className="icon-button" onClick={() => setShow(v => !v)} aria-label={show ? 'Masquer la clé' : 'Afficher la clé'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
    </>
  );
}

function ProviderCard({ id, index, total }: { id: ProviderId; index: number; total: number }) {
  const s = useSettings();
  const info = PROVIDERS[id];
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [dl, setDl] = useState<number | null>(null);

  const move = (d: -1 | 1) => setSettings(x => {
    const order = [...x.providerOrder];
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return x;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...x, providerOrder: order };
  });

  const fetchModels = async () => {
    setLoading(true);
    try {
      const list = await listModels(id);
      setModels(list);
      toast(`${list.length} modèle(s) disponible(s).`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Liste indisponible.', 'error', 6000);
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const t0 = performance.now();
    try {
      if (id === 'local') {
        const { localPreload } = await import('../lib/localllm');
        await localPreload(p => p.file && setDl(p.progress));
        setDl(null);
      }
      const r = await quickChat([{ role: 'user', content: 'Réponds seulement : OK' }], { only: id, temperature: 0 });
      setTest({ ok: true, text: `Réponse « ${r.text.slice(0, 40)} » en ${((performance.now() - t0) / 1000).toFixed(1)} s` });
    } catch (e) {
      setTest({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
      setDl(null);
    }
  };

  const enabled = s.enabled[id];
  return (
    <div className={`provider-card ${enabled ? 'on' : ''}`}>
      <div className="provider-head">
        <span className="order-badge" aria-label={`Priorité ${index + 1}`}>{index + 1}</span>
        <div className="provider-name"><b>{info.name}</b><small>{info.description}</small></div>
        <label className="switch">
          <input type="checkbox" role="switch" checked={enabled} aria-label={`Activer ${info.short}`} onChange={e => setSettings(x => ({ ...x, enabled: { ...x.enabled, [id]: e.target.checked } }))} />
          <i aria-hidden />
        </label>
      </div>
      {enabled && (
        <div className="provider-body">
          {info.howTo && <p className="howto">{info.howTo} {info.keyUrl && <a href={info.keyUrl} target="_blank" rel="noopener noreferrer">Ouvrir la page <ExternalLink size={12} /></a>}</p>}
          {info.keyField && id !== 'custom' && <KeyInput field={info.keyField} label={`Clé ${info.short}`} />}
          {id === 'custom' && <>
            <label className="field-label" htmlFor="custom-url">Adresse du serveur (compatible OpenAI, se termine souvent par /v1)</label>
            <input id="custom-url" className="settings-input" inputMode="url" value={s.customBaseUrl} onChange={e => setSettings(x => ({ ...x, customBaseUrl: e.target.value.trim() }))} placeholder="http://localhost:11434/v1" />
            <KeyInput field="custom" label="Clé (facultative)" />
          </>}
          {id === 'local' ? (
            <>
              <label className="field-label" htmlFor="local-model">Modèle local</label>
              <select id="local-model" className="settings-input" value={s.localModel} onChange={e => setSettings(x => ({ ...x, localModel: e.target.value }))}>
                {LOCAL_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <p className="howto">WebGPU : {'gpu' in navigator ? 'présent (rapide)' : 'absent → processeur (lent)'}. Le modèle est gardé en cache après le premier téléchargement et fonctionne ensuite hors ligne.</p>
            </>
          ) : (
            <>
              <label className="field-label" htmlFor={`model-${id}`}>Modèle</label>
              <div className="input-with-button">
                <input id={`model-${id}`} className="settings-input" list={`models-${id}`} value={s.models[id]} onChange={e => setSettings(x => ({ ...x, models: { ...x.models, [id]: e.target.value.trim() } }))} />
                <button className="secondary-button" onClick={fetchModels} disabled={loading}>{loading ? <Loader2 size={15} className="spin" /> : 'Liste'}</button>
              </div>
              <datalist id={`models-${id}`}>{models.map(m => <option key={m} value={m} />)}</datalist>
            </>
          )}
          <p className="limits"><b>Limites :</b> {info.limits}</p>
          <div className="row-actions">
            <button className="secondary-button" onClick={runTest} disabled={testing}>{testing ? <Loader2 size={15} className="spin" /> : <Plug size={15} />} Tester</button>
            <button className="icon-button" onClick={() => move(-1)} disabled={index === 0} aria-label="Monter en priorité"><ArrowUp size={16} /></button>
            <button className="icon-button" onClick={() => move(1)} disabled={index === total - 1} aria-label="Descendre en priorité"><ArrowDown size={16} /></button>
          </div>
          {dl !== null && <Progress value={dl / 100} label="Téléchargement du modèle" />}
          {test && <p className={test.ok ? 'ok-text' : 'error-text'}>{test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {test.text}</p>}
        </div>
      )}
    </div>
  );
}

export default function SettingsView() {
  const s = useSettings();
  const [voices, setVoices] = useState(getVoices());
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [newMem, setNewMem] = useState('');
  const [installEvt, setInstallEvt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const [voiceTest, setVoiceTest] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => onVoicesChanged(() => setVoices(getVoices())), []);
  useEffect(() => {
    const load = () => listMemory().then(setMemory);
    load();
    window.addEventListener('nexus-memory', load);
    const bip = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', bip);
    return () => { window.removeEventListener('nexus-memory', load); window.removeEventListener('beforeinstallprompt', bip); };
  }, []);

  const langVoices = voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(s.voice.lang.slice(0, 2).toLowerCase()));
  const setVoice = (p: Partial<typeof s.voice>) => setSettings(x => ({ ...x, voice: { ...x.voice, ...p } }));

  const testVoice = async () => {
    setVoiceTest('…');
    try {
      await speak(s.voice.lang.startsWith('fr') ? 'Bonjour, je suis NEXUS. Ravie de te parler.' : 'Hello, I am NEXUS. Nice to talk to you.', t => setVoiceTest(t));
      setVoiceTest('');
    } catch (e) {
      setVoiceTest(e instanceof Error ? e.message : 'Lecture impossible.');
    }
  };

  const doExport = async (media: boolean) => {
    const data = await exportAll(media);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-ai-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('Sauvegarde téléchargée (sans tes clés).');
  };

  const doImport = async (f?: File) => {
    if (!f) return;
    try {
      const n = await importAll(JSON.parse(await f.text()));
      toast(`${n} conversation(s) importée(s).`);
    } catch (e) {
      toast(`Import impossible : ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const wipe = async () => {
    if (!confirm('Effacer TOUTES tes données NEXUS sur cet appareil (conversations, galerie, mémoire, réglages, clés, modèles téléchargés) ?')) return;
    await wipeEverything();
    resetSettings();
    toast('Tout a été effacé.');
    setTimeout(() => location.reload(), 800);
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <div className="settings-grid">
      <nav className="settings-nav" aria-label="Sections des réglages">
        {[['providers', 'Fournisseurs'], ['voice', 'Voix'], ['media', 'Images & vidéo'], ['web', 'Web'], ['memory', 'Mémoire'], ['data', 'Données'], ['install', 'Installer']].map(([id, l]) => (
          <a key={id} href={`#/settings`} onClick={e => { e.preventDefault(); document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>{l}</a>
        ))}
      </nav>

      <Section icon={Plug} title="Fournisseurs de chat" id="set-providers">
        <p className="muted-text">NEXUS essaie les fournisseurs actifs dans cet ordre et passe automatiquement au suivant en cas d’échec. Tous sont gratuits ou ont une offre gratuite ; aucun n’est illimité.</p>
        {s.providerOrder.map((id, i) => <ProviderCard key={id} id={id} index={i} total={s.providerOrder.length} />)}
        <p className="key-warning"><KeyRound size={14} /> Tes clés restent dans le stockage de ce navigateur et ne sont envoyées qu’au service concerné. Ne les saisis pas sur un appareil partagé. Elles ne sont jamais incluses dans les exports.</p>
        <label className="field-label" htmlFor="temp">Créativité : {s.temperature.toFixed(1)}</label>
        <input id="temp" type="range" className="range" min={0} max={1.4} step={0.1} value={s.temperature} onChange={e => setSettings({ temperature: Number(e.target.value) })} />
        <label className="field-label" htmlFor="hist">Mémoire de conversation : {s.maxHistory} derniers messages</label>
        <input id="hist" type="range" className="range" min={4} max={60} step={2} value={s.maxHistory} onChange={e => setSettings({ maxHistory: Number(e.target.value) })} />
      </Section>

      <Section icon={Mic} title="Voix" id="set-voice">
        <ul className="cap-list">
          <li className={capabilities.browserSTT ? 'yes' : 'no'}>Reconnaissance vocale du navigateur : {capabilities.browserSTT ? 'disponible' : 'absente'}</li>
          <li className={capabilities.browserTTS ? 'yes' : 'no'}>Lecture à voix haute du navigateur : {capabilities.browserTTS ? `disponible (${voices.length} voix)` : 'absente'}</li>
          <li className={capabilities.mic && capabilities.recorder ? 'yes' : 'no'}>Enregistrement micro (pour Whisper) : {capabilities.mic && capabilities.recorder ? 'disponible' : 'absent'}</li>
        </ul>
        <label className="field-label" htmlFor="lang">Langue</label>
        <select id="lang" className="settings-input" value={s.voice.lang} onChange={e => setVoice({ lang: e.target.value, voiceURI: '' })}>
          {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>

        <span className="field-label">Comprendre ma voix</span>
        <div className="chip-select" role="radiogroup">
          <button role="radio" aria-checked={s.voice.sttEngine === 'browser'} className={s.voice.sttEngine === 'browser' ? 'on' : ''} onClick={() => setVoice({ sttEngine: 'browser' })}>Navigateur <small>rapide</small></button>
          <button role="radio" aria-checked={s.voice.sttEngine === 'whisper'} className={s.voice.sttEngine === 'whisper' ? 'on' : ''} onClick={() => setVoice({ sttEngine: 'whisper' })}>Whisper <small>open source, privé</small></button>
        </div>
        <p className="howto">{s.voice.sttEngine === 'browser'
          ? 'Utilise le service du navigateur : Chrome envoie l’audio à Google, Safari à Apple (parfois traité sur l’appareil).'
          : 'Whisper (OpenAI, licence MIT) tourne dans ton navigateur : l’audio ne quitte pas l’appareil. Premier usage : téléchargement du modèle. Plus lent sur téléphone.'}</p>
        {s.voice.sttEngine === 'whisper' && (
          <select className="settings-input" aria-label="Modèle Whisper" value={s.voice.whisperModel} onChange={e => setVoice({ whisperModel: e.target.value })}>
            {WHISPER_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}

        <span className="field-label">Voix de NEXUS</span>
        <div className="chip-select" role="radiogroup">
          <button role="radio" aria-checked={s.voice.ttsEngine === 'browser'} className={s.voice.ttsEngine === 'browser' ? 'on' : ''} onClick={() => setVoice({ ttsEngine: 'browser' })}>Navigateur <small>instantané</small></button>
          <button role="radio" aria-checked={s.voice.ttsEngine === 'piper'} className={s.voice.ttsEngine === 'piper' ? 'on' : ''} onClick={() => setVoice({ ttsEngine: 'piper' })}>Piper <small>open source, hors ligne</small></button>
        </div>
        {s.voice.ttsEngine === 'browser' ? (
          <select className="settings-input" aria-label="Voix du navigateur" value={s.voice.voiceURI} onChange={e => setVoice({ voiceURI: e.target.value })}>
            <option value="">Automatique ({langVoices.length} voix pour cette langue)</option>
            {langVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} {v.localService ? '' : '(en ligne)'}</option>)}
          </select>
        ) : (
          <select className="settings-input" aria-label="Voix Piper" value={s.voice.piperVoice} onChange={e => setVoice({ piperVoice: e.target.value })}>
            {PIPER_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        )}
        <label className="field-label" htmlFor="rate">Vitesse : {s.voice.rate.toFixed(1)}×</label>
        <input id="rate" type="range" className="range" min={0.6} max={1.8} step={0.1} value={s.voice.rate} onChange={e => setVoice({ rate: Number(e.target.value) })} />
        {s.voice.ttsEngine === 'browser' && <>
          <label className="field-label" htmlFor="pitch">Tonalité : {s.voice.pitch.toFixed(1)}</label>
          <input id="pitch" type="range" className="range" min={0.5} max={1.5} step={0.1} value={s.voice.pitch} onChange={e => setVoice({ pitch: Number(e.target.value) })} />
        </>}
        <Toggle checked={s.voice.autoSpeak} onChange={v => setVoice({ autoSpeak: v })} label="Lire chaque réponse automatiquement" />
        <div className="row-actions">
          <button className="secondary-button" onClick={testVoice}><Volume2 size={15} /> Tester la voix</button>
          <button className="secondary-button" onClick={() => { stopSpeaking(); setVoiceTest(''); }}>Arrêter</button>
        </div>
        {voiceTest && <p className="howto">{voiceTest}</p>}
      </Section>

      <Section icon={ImageIcon} title="Images & vidéo" id="set-media">
        <p className="howto">Un <b>jeton Hugging Face gratuit</b> augmente ton quota GPU quotidien pour FLUX (images) et LTX-Video (vidéos). Crée un compte sur huggingface.co → Settings → Access Tokens → « Create new token » (type <b>Read</b>). <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">Ouvrir <ExternalLink size={12} /></a></p>
        <KeyInput field="hf" label="Jeton Hugging Face (hf_…)" />
        <KeyInput field="pollinations" label="Clé Pollinations (sk_…, facultative)" />
        <label className="field-label" htmlFor="pim">Modèle d’image Pollinations+ (avec clé)</label>
        <input id="pim" className="settings-input" value={s.image.keyModel} onChange={e => setSettings(x => ({ ...x, image: { ...x.image, keyModel: e.target.value.trim() } }))} />
        <label className="field-label" htmlFor="pvm">Modèle vidéo Pollinations+ (avec clé)</label>
        <input id="pvm" className="settings-input" value={s.video.keyModel} onChange={e => setSettings(x => ({ ...x, video: { ...x.video, keyModel: e.target.value.trim() } }))} />
      </Section>

      <Section icon={Globe} title="Recherche web" id="set-web">
        <p className="howto">Par défaut, la recherche utilise l’API ouverte de <b>Wikipédia</b>. Les liens que tu colles sont lus via <b>Jina Reader</b> (gratuit, ~20 pages/minute). Tu peux brancher ta propre instance <b>SearXNG</b> (moteur open source) si elle autorise le format JSON et ce site (CORS).</p>
        <label className="field-label" htmlFor="wl">Langue Wikipédia</label>
        <select id="wl" className="settings-input" value={s.web.wikiLang} onChange={e => setSettings(x => ({ ...x, web: { ...x.web, wikiLang: e.target.value } }))}>
          {['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'nl'].map(l => <option key={l} value={l}>{l}.wikipedia.org</option>)}
        </select>
        <label className="field-label" htmlFor="sx">Instance SearXNG (facultatif)</label>
        <input id="sx" className="settings-input" inputMode="url" value={s.web.searxUrl} onChange={e => setSettings(x => ({ ...x, web: { ...x.web, searxUrl: e.target.value.trim() } }))} placeholder="https://mon-searxng.example" />
        <Toggle checked={s.web.readLinks} onChange={v => setSettings(x => ({ ...x, web: { ...x.web, readLinks: v } }))} label="Lire automatiquement les liens collés dans le chat" />
      </Section>

      <Section icon={Brain} title="Mémoire & apprentissage" id="set-memory">
        <p className="howto">NEXUS ne modifie pas son modèle : il <b>s’améliore localement</b> en retenant des informations utiles sur toi et des « leçons » tirées de tes 👎. Elles sont ajoutées à ses consignes. Tout reste sur cet appareil ; tu peux tout voir et supprimer ici.</p>
        <Toggle checked={s.memoryEnabled} onChange={v => setSettings({ memoryEnabled: v })} label="Activer la mémoire" />
        <div className="memory-list">
          {memory.length === 0 && <p className="muted-text">Aucun souvenir pour le moment.</p>}
          {memory.map(m => (
            <div key={m.id} className="memory-item">
              <span className={`mem-kind ${m.kind}`}>{m.kind === 'fact' ? 'Souvenir' : 'Leçon'}</span>
              <p>{m.text}</p>
              <button className="icon-button small" onClick={() => deleteMemory(m.id)} aria-label="Oublier"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="input-with-button">
          <input className="settings-input" value={newMem} onChange={e => setNewMem(e.target.value)} placeholder="Ajouter : « Je m’appelle Diana », « Réponses courtes »…" aria-label="Nouveau souvenir" />
          <button className="secondary-button" onClick={async () => { if (await addMemory('fact', newMem)) { setNewMem(''); toast('Ajouté.'); } }}>Ajouter</button>
        </div>
      </Section>

      <Section icon={Database} title="Tes données" id="set-data">
        <p className="howto">Conversations, galerie, mémoire et réglages sont stockés <b>uniquement dans ce navigateur</b> (IndexedDB). Effacer les données du site ou changer d’appareil les supprime : pense à exporter.</p>
        <div className="row-actions wrap">
          <button className="secondary-button" onClick={() => doExport(false)}><Download size={15} /> Exporter (texte)</button>
          <button className="secondary-button" onClick={() => doExport(true)}><Download size={15} /> Exporter avec images/vidéos</button>
          <button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={15} /> Importer</button>
          <button className="danger-button" onClick={wipe}><Trash2 size={15} /> Tout effacer</button>
        </div>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="ghost-button" onClick={() => go('privacy')}>Voir quelles données partent vers quels services →</button>
      </Section>

      <Section icon={Smartphone} title="Installer l’application" id="set-install">
        {standalone ? <p className="ok-text"><CheckCircle2 size={14} /> NEXUS est déjà installée sur cet appareil.</p> : isIOS ? (
          <ol className="steps"><li>Ouvre ce site dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (carré avec une flèche).</li><li>Choisis <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li></ol>
        ) : installEvt?.prompt ? (
          <button className="primary-button" onClick={() => installEvt.prompt?.()}><Smartphone size={16} /> Installer NEXUS</button>
        ) : (
          <p className="howto">Dans Chrome/Edge : menu ⋮ → <b>Installer l’application</b> (ou « Ajouter à l’écran d’accueil »).</p>
        )}
        <p className="howto">Une fois installée, l’interface, la galerie et l’historique s’ouvrent même hors connexion. Les réponses IA demandent Internet, sauf le mode <b>IA dans le navigateur</b>.</p>
      </Section>

      <Section icon={Cpu} title="À propos" id="set-about">
        <p className="howto">NEXUS AI — Pink Diamond Edition · version 1.0.0 · code ouvert. Modèles et services tiers : Pollinations (GPT-OSS, Sana, FLUX), Hugging Face (FLUX.1 schnell, LTX-Video, Whisper, Qwen, SmolLM), Piper, Wikipédia, Jina Reader. Chaque service garde ses propres conditions d’utilisation.</p>
        <button className="ghost-button" onClick={() => { if (confirm('Rétablir les réglages par défaut ? (tes clés seront effacées)')) resetSettings(); }}>Rétablir les réglages par défaut</button>
      </Section>
    </div>
  );
}
