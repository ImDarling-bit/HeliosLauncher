import * as Location from 'expo-location';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { Coords } from '../types';
import { toShared } from '../utils/geo';

type Permission = 'unknown' | 'granted' | 'denied';

interface LocationValue {
  /** Position précise : reste sur le téléphone (affichage de la carte). */
  coords: Coords | null;
  /** Position arrondie : la seule qui est envoyée aux serveurs. */
  shared: Coords | null;
  permission: Permission;
}

const LocationContext = createContext<LocationValue>({
  coords: null,
  shared: null,
  permission: 'unknown',
});

export function LocationProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permission, setPermission] = useState<Permission>('unknown');

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      const last = await Location.getLastKnownPositionAsync();
      if (alive && last) setCoords(pick(last));
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 10_000 },
        (loc) => setCoords(pick(loc))
      );
      if (alive) sub = s;
      else s.remove();
    })().catch(() => setPermission('denied'));

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [enabled]);

  // Partage désactivé : aucune position n'est exposée, même en mémoire.
  const visibleCoords = enabled ? coords : null;
  const shared = useMemo(() => toShared(visibleCoords), [visibleCoords]);
  // On ne recrée la valeur partagée que si la position arrondie change,
  // pour éviter de spammer le serveur à chaque petit déplacement.
  const sharedKey = shared ? `${shared.latitude},${shared.longitude}` : '';
  const stableShared = useMemo(() => shared, [sharedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ coords: visibleCoords, shared: stableShared, permission }),
    [visibleCoords, stableShared, permission]
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

const pick = (l: Location.LocationObject): Coords => ({
  latitude: l.coords.latitude,
  longitude: l.coords.longitude,
});

export const useLocation = () => useContext(LocationContext);
