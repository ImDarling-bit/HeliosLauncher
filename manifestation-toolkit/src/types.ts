export type Role = 'user' | 'medic' | 'supply' | 'protection';

export type Hand = 'right' | 'left';

export interface Profile {
  /** UUID v4 généré localement. Ne quitte jamais le téléphone. */
  uuid: string;
  pseudo: string;
  /** 4 premiers caractères hexadécimaux de l'UUID, ex. "48F2". */
  tag: string;
  role: Role;
  createdAt: number;
}

export interface Settings {
  hand: Hand;
  /** Partager une position arrondie (~100 m) pour le chat et la carte. */
  shareLocation: boolean;
}

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface ChatMessage {
  id: string;
  /** "Pseudo#48F2" */
  author: string;
  role: Role;
  text: string;
  latitude?: number;
  longitude?: number;
  ts: number;
}

export type ReportType = 'danger' | 'kettle' | 'medic' | 'supply';

export interface Report {
  id: string;
  type: ReportType;
  latitude: number;
  longitude: number;
  author: string;
  createdAt: number;
  expiresAt: number;
  /** Ajouté localement, pas encore confirmé par le serveur. */
  pending?: boolean;
}

export interface WikiSection {
  heading: string;
  body: string;
}

export interface WikiArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  sections: WikiSection[];
}
