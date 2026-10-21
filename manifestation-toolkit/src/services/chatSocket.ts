import { CONFIG } from '../config';
import type { ChatMessage, Coords, Report, ReportType, Role } from '../types';
import { isValidCoord } from '../utils/geo';
import { newId } from '../utils/id';

// Protocole complet : docs/PROTOCOL.md

export type SocketStatus = 'offline' | 'connecting' | 'online';

export interface Identity {
  /** "Pseudo#48F2". L'UUID complet n'est jamais envoyé. */
  name: string;
  role: Role;
}

type Events = {
  status: SocketStatus;
  message: ChatMessage;
  report: Report;
  reportRemoved: string;
};

type Listener<K extends keyof Events> = (payload: Events[K]) => void;

const ROLES: Role[] = ['user', 'medic', 'supply', 'protection'];
const REPORT_TYPES: ReportType[] = ['danger', 'kettle', 'medic', 'supply'];
const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

class ChatSocket {
  private ws: WebSocket | null = null;
  private url = '';
  private identity: Identity | null = null;
  private position: Coords | null = null;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private listeners: { [K in keyof Events]: Set<Listener<K>> } = {
    status: new Set(),
    message: new Set(),
    report: new Set(),
    reportRemoved: new Set(),
  };

  status: SocketStatus = 'offline';

  on<K extends keyof Events>(event: K, cb: Listener<K>): () => void {
    this.listeners[event].add(cb);
    return () => {
      this.listeners[event].delete(cb);
    };
  }

  connect(url: string, identity: Identity, position: Coords | null) {
    this.shutdown();
    this.url = url;
    this.identity = identity;
    this.position = position;
    this.stopped = false;
    this.open();
  }

  /** Ferme la connexion et annule toute reconnexion (utilisé par la purge). */
  shutdown() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onopen = null;
      try {
        this.ws.close();
      } catch {
        // déjà fermé
      }
      this.ws = null;
    }
    this.setStatus('offline');
  }

  /** Envoie un message ; renvoie l'objet créé, ou null si hors ligne. */
  sendChat(text: string, role: Role): ChatMessage | null {
    const clean = text.trim().slice(0, CONFIG.maxMessageLength);
    if (!clean || !this.identity) return null;
    const msg: ChatMessage = {
      id: newId(),
      author: this.identity.name,
      role,
      text: clean,
      ts: Date.now(),
      ...(this.position ?? {}),
    };
    return this.send({ type: 'chat', ...msg }) ? msg : null;
  }

  /** Position arrondie utilisée par le serveur pour filtrer le chat local. */
  updatePosition(position: Coords | null) {
    this.position = position;
    this.send({ type: 'position', ...(position ?? { latitude: null, longitude: null }) });
  }

  private send(payload: object): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private open() {
    this.clearTimers();
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('online');
      this.send({
        type: 'hello',
        name: this.identity?.name,
        role: this.identity?.role,
        radius: CONFIG.radiusMeters,
        ...(this.position ?? {}),
      });
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_MS);
    };

    ws.onmessage = (e) => this.handle(e.data);
    ws.onerror = () => {
      // onclose suit toujours : la reconnexion est gérée là.
    };
    ws.onclose = () => {
      this.ws = null;
      this.clearTimers();
      this.setStatus('offline');
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retry) + Math.random() * 500;
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  private setStatus(s: SocketStatus) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]) {
    this.listeners[event].forEach((cb) => cb(payload));
  }

  // Tout ce qui vient du réseau est validé avant d'atteindre l'UI.
  private handle(raw: unknown) {
    if (typeof raw !== 'string' || raw.length > 10_000) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'chat': {
        const msg = parseMessage(data);
        if (msg) this.emit('message', msg);
        break;
      }
      case 'report': {
        const report = parseReport(data.report);
        if (report) this.emit('report', report);
        break;
      }
      case 'report_removed':
        if (typeof data.id === 'string') this.emit('reportRemoved', data.id);
        break;
      default:
        break;
    }
  }
}

function parseMessage(d: Record<string, unknown>): ChatMessage | null {
  if (
    typeof d.id !== 'string' ||
    typeof d.author !== 'string' ||
    typeof d.text !== 'string' ||
    typeof d.ts !== 'number' ||
    !ROLES.includes(d.role as Role)
  ) {
    return null;
  }
  const msg: ChatMessage = {
    id: d.id.slice(0, 64),
    author: d.author.slice(0, 40),
    role: d.role as Role,
    text: d.text.slice(0, CONFIG.maxMessageLength),
    ts: d.ts,
  };
  if (isValidCoord(d.latitude, d.longitude)) {
    msg.latitude = d.latitude as number;
    msg.longitude = d.longitude as number;
  }
  return msg;
}

export function parseReport(r: unknown): Report | null {
  if (!r || typeof r !== 'object') return null;
  const d = r as Record<string, unknown>;
  if (
    typeof d.id !== 'string' ||
    !REPORT_TYPES.includes(d.type as ReportType) ||
    !isValidCoord(d.latitude, d.longitude) ||
    typeof d.createdAt !== 'number'
  ) {
    return null;
  }
  return {
    id: d.id.slice(0, 64),
    type: d.type as ReportType,
    latitude: d.latitude as number,
    longitude: d.longitude as number,
    author: typeof d.author === 'string' ? d.author.slice(0, 40) : '?',
    createdAt: d.createdAt,
    expiresAt:
      typeof d.expiresAt === 'number' ? d.expiresAt : d.createdAt + CONFIG.reportTtlMs,
  };
}

/** Instance unique partagée par toute l'app. */
export const chatSocket = new ChatSocket();
