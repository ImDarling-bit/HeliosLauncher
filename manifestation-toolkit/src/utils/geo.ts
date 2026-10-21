import { CONFIG } from '../config';
import type { Coords } from '../types';

/** Arrondit une position avant de l'envoyer au serveur (~110 m avec 3 décimales). */
export function toShared(c: Coords | null): Coords | null {
  if (!c) return null;
  const f = 10 ** CONFIG.sharedCoordDecimals;
  return {
    latitude: Math.round(c.latitude * f) / f,
    longitude: Math.round(c.longitude * f) / f,
  };
}

/** Distance en mètres (formule de haversine). */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 150) return 'tout près';
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
