import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CONFIG } from '../config';
import { chatSocket } from '../services/chatSocket';
import { loadMessages, saveMessages } from '../storage/storage';
import type { ChatMessage } from '../types';

interface ChatValue {
  /** Plus récent en premier. */
  messages: ChatMessage[];
  add: (m: ChatMessage) => void;
  unread: number;
  markRead: () => void;
}

const ChatContext = createContext<ChatValue | null>(null);

/**
 * Garde les messages pendant toute la session, même quand l'onglet Chat
 * n'est pas affiché. Remonté à neuf après une purge (via la `key` de Root).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const add = useCallback((msg: ChatMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev].slice(0, CONFIG.maxCachedMessages)
    );
  }, []);

  useEffect(() => {
    let alive = true;
    loadMessages().then((cached) => {
      if (!alive) return;
      loaded.current = true;
      setMessages((prev) => mergeById(prev, cached));
    });
    const off = chatSocket.on('message', (m) => {
      add(m);
      setUnread((n) => n + 1);
    });
    return () => {
      alive = false;
      off();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [add]);

  // Sauvegarde différée ; jamais avant d'avoir relu le cache.
  useEffect(() => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveMessages(messages), 1000);
  }, [messages]);

  const markRead = useCallback(() => setUnread(0), []);

  const value = useMemo(() => ({ messages, add, unread, markRead }), [messages, add, unread, markRead]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat doit être utilisé dans <ChatProvider>');
  return ctx;
}

function mergeById(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const seen = new Set(a.map((m) => m.id));
  return [...a, ...b.filter((m) => !seen.has(m.id))]
    .sort((x, y) => y.ts - x.ts)
    .slice(0, CONFIG.maxCachedMessages);
}
