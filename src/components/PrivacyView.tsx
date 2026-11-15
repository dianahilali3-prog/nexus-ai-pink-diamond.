import { ShieldCheck } from 'lucide-react';
import { AiDisclaimer } from './ui';

const ROWS: [string, string, string, string][] = [
  ['Chat (par défaut)', 'text.pollinations.ai', 'Tes messages, l’historique récent de la conversation, les extraits de documents/web utilisés', 'Toujours, sauf si tu désactives Pollinations'],
  ['Chat (options)', 'openrouter.ai · api.groq.com · gen.pollinations.ai (Kimi, GLM…) · ton serveur', 'Mêmes données + ta clé pour ce service', 'Seulement si tu actives ce fournisseur'],
  ['IA dans le navigateur', 'huggingface.co (téléchargement)', 'Rien sur toi : seul le modèle est téléchargé', 'Seulement si tu l’actives'],
  ['Images', 'image.pollinations.ai', 'Le prompt de l’image (envoyé dans l’adresse)', 'À chaque image'],
  ['Images (secours) & vidéo IA', 'Espaces Hugging Face : FLUX, Qwen-Image, Wan, LTX-Video', 'Le prompt, l’image à animer (Wan), ton jeton HF si tu l’as saisi', 'Si Pollinations échoue, ou en mode Vidéo IA'],
  ['Recherche web', 'fr.wikipedia.org (ou ton SearXNG)', 'Les mots-clés de ta question', 'Quand le globe 🌐 est activé ou avec l’agent Orion'],
  ['Lecture de liens', 'r.jina.ai', 'L’adresse du lien que tu colles', 'Quand tu colles un lien dans le chat'],
  ['Dictée (navigateur)', 'Google (Chrome) ou Apple (Safari)', 'Ton audio', 'Quand tu dictes avec le moteur « Navigateur »'],
  ['Dictée Whisper / voix Piper', 'huggingface.co, cdn.jsdelivr.net, cdnjs (téléchargement)', 'Rien sur toi : l’audio reste sur l’appareil', 'Premier usage uniquement'],
  ['Usine à vidéos (mouvement 3D)', 'huggingface.co (modèle de profondeur, une fois) · image.pollinations.ai (images des idées)', 'Les idées pour créer les images ; tes photos restent sur l’appareil', 'À chaque vidéo créée à partir d’une idée'],
  ['Lecture de PDF / Word / images à décrire', 'Aucun', 'Traitement sur ton appareil', '—']
];

export default function PrivacyView() {
  return (
    <section className="panel">
      <div className="panel-title">
        <span className="large-icon"><ShieldCheck size={21} /></span>
        <div><h2>Confidentialité</h2><p>Ce qui reste chez toi, ce qui part, et où.</p></div>
      </div>
      <div className="notice-box">
        <ShieldCheck size={18} />
        <p><b>Rien n’est stocké sur un serveur NEXUS</b> : il n’y en a pas. Conversations, galerie, mémoire, réglages et clés restent dans ton navigateur. Aucun compte, aucune publicité, aucun traceur.</p>
      </div>
      <div className="table-wrap">
        <table className="privacy-table">
          <thead><tr><th>Fonction</th><th>Service contacté</th><th>Ce qui est envoyé</th><th>Quand</th></tr></thead>
          <tbody>{ROWS.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3 className="sub-title">Bon à savoir</h3>
      <ul className="plain-list">
        <li>Ces services sont gratuits mais <b>sans garantie</b> : ils peuvent ralentir, imposer des limites ou changer leurs conditions.</li>
        <li>N’envoie pas d’informations très sensibles (santé, papiers d’identité, mots de passe) à un service en ligne. Pour un maximum de confidentialité, utilise <b>l’IA dans le navigateur</b> ou ton propre serveur (Ollama).</li>
        <li>Les polices et l’interface sont servies par GitHub Pages ; aucune ressource Google Fonts ni statistique n’est chargée.</li>
        <li>Les prompts d’images envoyés à Pollinations le sont avec l’option « privé » (pas de publication dans leur flux public).</li>
      </ul>
      <AiDisclaimer />
    </section>
  );
}
