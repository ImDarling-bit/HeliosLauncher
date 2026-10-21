import { randomUUID } from 'expo-crypto';

export const newId = () => randomUUID();

/** "48F2" à partir de l'UUID local. */
export const tagFromUuid = (uuid: string) =>
  uuid.replace(/-/g, '').slice(0, 4).toUpperCase();
