import { quickChat, type WireMessage, type ContentPart } from './providers';
import { getSettings } from './settings';
import { addMemory } from './storage';
import type { Agent, ChatMessage, MemoryItem } from './types';

const DAYS = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' });

export function buildSystemPrompt(agent: Agent, memory: MemoryItem[], extra: { web?: string; docs?: string; images?: string[] }) {
  const s = getSettings();
  const facts = memory.filter(m => m.kind === 'fact').map(m => `- ${m.text}`).join('\n');
  const lessons = memory.filter(m => m.kind === 'lesson').map(m => `- ${m.text}`).join('\n');
  const parts = [
    `Tu es ${agent.name === 'NEXUS' ? 'NEXUS' : `${agent.name}, un agent de NEXUS`}, l’assistant IA de l’application « NEXUS AI — Pink Diamond Edition ». Nous sommes le ${DAYS.format(new Date())}.`,
    agent.instructions,
    `Règles :
- Réponds dans la langue de l’utilisatrice (français par défaut), avec un ton élégant et bienveillant.
- Utilise le Markdown (titres courts, listes, **gras**, tableaux, blocs de code) quand cela aide la lecture.
- Sois honnête : si tu ne sais pas ou si une information peut être dépassée, dis-le. N’invente ni source, ni lien, ni chiffre.
- Tu n’as pas accès à Internet par toi-même : seuls les extraits fournis ci-dessous viennent du web ou de documents. Cite-les avec [1], [2]…
- L’application sait générer des images : l’utilisatrice peut écrire « /image sa description » ou utiliser le Studio Image ; le Studio Vidéo transforme un texte ou un rapport en storyboard, images et vidéo.`
  ];
  if (s.memoryEnabled) {
    parts.push(
      `Mémoire : si l’utilisatrice partage une information durable et utile sur elle (prénom, préférences, projets, style souhaité), ajoute tout à la fin de ta réponse une ligne au format exact [[souvenir: information courte]]. N’enregistre jamais de données sensibles (santé, mots de passe, coordonnées bancaires). N’utilise ce format que si c’est vraiment utile.`
    );
    if (facts) parts.push(`Ce que tu sais déjà sur l’utilisatrice (mémoire locale) :\n${facts}`);
    if (lessons) parts.push(`Leçons tirées de ses retours précédents (à appliquer) :\n${lessons}`);
  }
  if (extra.docs) parts.push(`=== DOCUMENTS IMPORTÉS PAR L’UTILISATRICE ===\n${extra.docs}\n=== FIN DES DOCUMENTS ===`);
  if (extra.web) parts.push(`=== EXTRAITS WEB (récupérés à l’instant) ===\n${extra.web}\n=== FIN DES EXTRAITS ===`);
  if (extra.images?.length) parts.push(`Descriptions automatiques d’images jointes (modèle local, en anglais, peut être imprécis) :\n${extra.images.map(d => `- ${d}`).join('\n')}`);
  return parts.join('\n\n');
}

const MEM_RE = /\[\[\s*souvenir\s*:\s*([^\]]+?)\s*\]\]/gi;

export function extractMemory(text: string) {
  const found: string[] = [];
  const clean = text.replace(MEM_RE, (_, m: string) => { found.push(m); return ''; }).trim();
  return { clean, found };
}

/** Pendant le flux, masque une balise de mémoire en cours d’écriture. */
export function hideStreamingTags(text: string) {
  return text.replace(MEM_RE, '').replace(/\[\[?\s*s?o?u?v?e?n?i?r?[^\]]*$/i, '').trimEnd();
}

export async function rememberAll(found: string[]) {
  const saved: string[] = [];
  for (const f of found) if (await addMemory('fact', f)) saved.push(f);
  return saved;
}

/** Transforme l’historique en messages pour l’API, en limitant la longueur. */
export function toWire(system: string, history: ChatMessage[], current: { text: string; images: string[] }): WireMessage[] {
  const s = getSettings();
  const msgs: WireMessage[] = [{ role: 'system', content: system }];
  let budget = 40_000;
  const past: WireMessage[] = [];
  for (const m of history.filter(m => !m.error).slice(-s.maxHistory).reverse()) {
    budget -= m.content.length;
    if (budget < 0) break;
    past.unshift({ role: m.role, content: m.content });
  }
  msgs.push(...past);
  if (current.images.length) {
    const content: ContentPart[] = [{ type: 'text', text: current.text }, ...current.images.map(url => ({ type: 'image_url' as const, image_url: { url } }))];
    msgs.push({ role: 'user', content });
  } else msgs.push({ role: 'user', content: current.text });
  return msgs;
}

export const IMAGE_CMD = /^\s*\/(image|img|dessine)\s+(.+)/is;
export const IMAGE_INTENT =
  /^\s*(?:peux-tu\s+|pourrais-tu\s+|stp\s+|s'il te plaît\s+)?(?:g[ée]n[èeé]re|cr[ée]e|dessine|fais|fabrique|imagine|montre|produis)(?:[\s-]*(?:moi|nous))?\s+(?:une?|des|la|le|l')?\s*(?:image|photo|illustration|dessin|logo|portrait|affiche|visuel|fond d'écran|wallpaper|picture)s?\b\s*(?:de|d'|du|des|représentant|montrant|avec|:)?\s*(.+)/is;

export function detectImageRequest(text: string): string | null {
  const cmd = IMAGE_CMD.exec(text);
  if (cmd) return cmd[2].trim();
  const intent = IMAGE_INTENT.exec(text);
  if (intent && intent[1].trim().length > 2) return intent[1].trim();
  return null;
}

export async function makeTitle(firstQuestion: string) {
  const fallback = firstQuestion.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ').slice(0, 48);
  try {
    const { text } = await quickChat(
      [
        { role: 'system', content: 'Tu es un outil qui nomme des conversations. Tu ne réponds jamais à la question : tu donnes seulement un titre de 2 à 5 mots qui résume le sujet, sans guillemets ni ponctuation finale, dans la langue du message.' },
        { role: 'user', content: `Message à résumer en titre :\n«${firstQuestion.slice(0, 600)}»\n\nTitre :` }
      ],
      { temperature: 0.2, maxTokens: 300 }
    );
    const t = text.split('\n')[0].replace(/^(titre\s*:\s*)/i, '').replace(/^["'«\s#*]+|["'»\s.*]+$/g, '');
    return t && t.split(/\s+/).length <= 7 && !/^(je|bonjour|en tant)/i.test(t) ? t.slice(0, 48) : fallback;
  } catch {
    return fallback;
  }
}

/** Apprentissage local : un retour négatif devient une « leçon » réutilisée ensuite. */
export async function learnFromFeedback(question: string, answer: string, comment: string) {
  const { text } = await quickChat(
    [
      {
        role: 'system',
        content:
          'À partir d’une question, d’une réponse jugée insatisfaisante par l’utilisatrice et de son commentaire éventuel, écris UNE consigne courte (20 mots max, à l’impératif) que l’assistant devra suivre à l’avenir. Réponds uniquement par la consigne.'
      },
      { role: 'user', content: `Question : ${question.slice(0, 1500)}\n\nRéponse : ${answer.slice(0, 2500)}\n\nCommentaire : ${comment || '(aucun)'}` }
    ],
    { temperature: 0.2, maxTokens: 300 }
  );
  const lesson = text.split('\n')[0].replace(/^[-*"«\s]+|["»\s]+$/g, '');
  if (lesson) await addMemory('lesson', lesson);
  return lesson;
}
