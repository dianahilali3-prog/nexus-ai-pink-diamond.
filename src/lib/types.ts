export type Tab = 'home' | 'chat' | 'images' | 'videos' | 'library' | 'agents' | 'settings' | 'privacy';

export type Role = 'system' | 'user' | 'assistant';

export interface Source {
  title: string;
  url: string;
}

export interface Attachment {
  id: string;
  name: string;
  kind: 'document' | 'image';
  /** Texte extrait (documents) ou description (images). */
  text: string;
  /** Pour les images : data URL réduite, envoyée aux modèles « vision ». */
  dataUrl?: string;
  chars: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  provider?: string;
  model?: string;
  sources?: Source[];
  images?: string[]; // identifiants de la galerie
  attachments?: Attachment[];
  error?: boolean;
  feedback?: 'up' | 'down';
  notes?: string[]; // infos discrètes (ex. bascule de fournisseur)
}

export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  webSearch?: boolean;
}

export interface GalleryItem {
  id: string;
  kind: 'image' | 'video';
  prompt: string;
  source: string;
  createdAt: number;
  width?: number;
  height?: number;
  mime: string;
}

export interface MemoryItem {
  id: string;
  kind: 'fact' | 'lesson';
  text: string;
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  instructions: string;
  web?: boolean;
  starter?: string[];
  custom?: boolean;
}
