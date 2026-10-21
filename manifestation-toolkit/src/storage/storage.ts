import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatMessage, Profile, Report, Settings } from '../types';

const KEYS = {
  profile: 'mt:profile',
  settings: 'mt:settings',
  messages: 'mt:messages',
  reports: 'mt:reports',
} as const;

// Pendant une purge, toute écriture est ignorée pour qu'une sauvegarde
// différée (cache du chat, etc.) ne puisse pas réécrire des données effacées.
let purging = false;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  if (purging) return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou indisponible : l'app continue en mémoire.
  }
}

export const loadProfile = () => readJson<Profile>(KEYS.profile);
export const saveProfile = (p: Profile) => writeJson(KEYS.profile, p);

export const loadSettings = () => readJson<Settings>(KEYS.settings);
export const saveSettings = (s: Settings) => writeJson(KEYS.settings, s);

export const loadMessages = async () =>
  (await readJson<ChatMessage[]>(KEYS.messages)) ?? [];
export const saveMessages = (m: ChatMessage[]) => writeJson(KEYS.messages, m);

export const loadReports = async () =>
  (await readJson<Report[]>(KEYS.reports)) ?? [];
export const saveReports = (r: Report[]) => writeJson(KEYS.reports, r);

/** Bouton d'urgence : efface tout le stockage local de l'app. */
export async function purgeAll(): Promise<void> {
  purging = true;
  try {
    await AsyncStorage.clear();
  } finally {
    purging = false;
  }
}
