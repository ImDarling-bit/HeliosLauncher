import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { CONFIG, FALLBACK_COORDS } from '../config';
import { useApp } from '../context/AppContext';
import { useLocation } from '../context/LocationContext';
import { useHand } from '../hooks/useHand';
import { createReport, fetchReports } from '../services/api';
import { chatSocket } from '../services/chatSocket';
import { loadReports, saveReports } from '../storage/storage';
import { colors, font, radius, spacing } from '../theme';
import type { Coords, Report, ReportType } from '../types';
import { success, warning } from '../utils/haptics';
import { newId } from '../utils/id';
import { REPORT_TYPES, reportMeta, timeAgo } from '../utils/labels';
import { darkMapStyle } from './mapStyle';

const REFRESH_MS = 60_000;
const DELTA = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

export function MapScreen() {
  const { profile } = useApp();
  const { coords, permission } = useLocation();
  const { row } = useHand();
  const mapRef = useRef<MapView>(null);
  const center = useRef<Coords>(coords ?? FALLBACK_COORDS);
  const centeredOnce = useRef(false);
  const loaded = useRef(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Horloge pour masquer les signalements expirés et rafraîchir « il y a X min ».
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const upsert = useCallback((r: Report) => {
    setReports((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
  }, []);

  // Cache local (affichage immédiat, même hors ligne) + temps réel.
  useEffect(() => {
    loadReports().then((cached) => {
      loaded.current = true;
      setReports((prev) => (prev.length ? prev : cached));
    });
    const offAdd = chatSocket.on('report', upsert);
    const offDel = chatSocket.on('reportRemoved', (id) =>
      setReports((prev) => prev.filter((r) => r.id !== id))
    );
    return () => {
      offAdd();
      offDel();
    };
  }, [upsert]);

  // Rafraîchissement périodique depuis l'API REST + purge des signalements expirés.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const fresh = await fetchReports(center.current);
        if (alive) setReports((prev) => [...prev.filter((r) => r.pending), ...fresh]);
      } catch {
        if (alive) setReports((prev) => prev.filter((r) => r.expiresAt > Date.now()));
      }
    };
    void refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (loaded.current) void saveReports(reports.filter((r) => !r.pending));
  }, [reports]);

  // Centrage automatique la première fois que la position arrive.
  useEffect(() => {
    if (coords && !centeredOnce.current) {
      centeredOnce.current = true;
      mapRef.current?.animateToRegion({ ...coords, ...DELTA }, 400);
    }
  }, [coords]);

  const recenter = () => {
    if (coords) mapRef.current?.animateToRegion({ ...coords, ...DELTA }, 300);
    else setNotice('Position indisponible.');
  };

  const submit = async (type: ReportType) => {
    if (!profile) return;
    setAdding(false);
    const position = { ...center.current };
    const temp = pendingReport(type, position, `${profile.pseudo}#${profile.tag}`);
    upsert(temp);
    try {
      const saved = await createReport({ type, position, author: temp.author });
      setReports((prev) => [saved, ...prev.filter((r) => r.id !== temp.id && r.id !== saved.id)]);
      success();
      setNotice(`${reportMeta(type).label} signalé.`);
    } catch {
      setReports((prev) => prev.filter((r) => r.id !== temp.id));
      warning();
      setNotice('Échec de l’envoi : réseau indisponible. Réessaie.');
    }
  };

  const visible = reports.filter((r) => r.expiresAt > now);

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...(coords ?? FALLBACK_COORDS), ...DELTA }}
        onRegionChangeComplete={(r: Region) => {
          center.current = { latitude: r.latitude, longitude: r.longitude };
        }}
        showsUserLocation={permission === 'granted'}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        customMapStyle={darkMapStyle}
        userInterfaceStyle="dark"
      >
        {visible.map((r) => {
          const meta = reportMeta(r.type);
          return (
            <Marker
              key={r.id}
              coordinate={{ latitude: r.latitude, longitude: r.longitude }}
              title={`${meta.icon} ${meta.label}${r.pending ? ' (envoi…)' : ''}`}
              description={`${timeAgo(r.createdAt, now)} · ${r.author}`}
              pinColor={meta.color}
              opacity={r.pending ? 0.6 : 1}
            />
          );
        })}
      </MapView>

      {/* Viseur : le signalement est posé au centre de la carte. */}
      {adding ? (
        <View pointerEvents="none" style={styles.crosshairWrap}>
          <Text style={styles.crosshair}>✛</Text>
        </View>
      ) : null}

      <SafeAreaView edges={['top']} pointerEvents="none" style={styles.top}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {adding
              ? 'Déplace la carte sous le viseur, puis choisis le type'
              : `${visible.length} signalement${visible.length > 1 ? 's' : ''} · 1 h max`}
          </Text>
          {permission === 'denied' ? (
            <Text style={styles.bannerWarn}>Localisation refusée : carte centrée par défaut.</Text>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Zone du pouce */}
      <View style={styles.bottom}>
        {notice ? (
          <Text style={styles.notice} onPress={() => setNotice(null)}>
            {notice}
          </Text>
        ) : null}

        {adding ? (
          <>
            <View style={styles.grid}>
              {REPORT_TYPES.map((t) => (
                <BigButton
                  key={t.id}
                  label={t.label}
                  icon={t.icon}
                  large
                  onPress={() => void submit(t.id)}
                  style={[styles.cell, { borderColor: t.color }]}
                />
              ))}
            </View>
            <BigButton label="Annuler" onPress={() => setAdding(false)} />
          </>
        ) : (
          <View style={[styles.actions, { flexDirection: row }]}>
            <BigButton label="Me centrer" icon="◎" onPress={recenter} style={styles.secondary} />
            <BigButton
              label="Signaler"
              icon="➕"
              variant="primary"
              large
              onPress={() => {
                setNotice(null);
                setAdding(true);
              }}
              style={styles.primary}
            />
          </View>
        )}
      </View>
    </View>
  );
}

/** Signalement affiché tout de suite, en attendant la réponse du serveur. */
function pendingReport(type: ReportType, position: Coords, author: string): Report {
  const createdAt = Date.now();
  return {
    id: `local-${newId()}`,
    type,
    ...position,
    author,
    createdAt,
    expiresAt: createdAt + CONFIG.reportTtlMs,
    pending: true,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  banner: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(18,18,18,0.9)',
  },
  bannerText: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  bannerWarn: { color: colors.warning, fontSize: font.small, marginTop: spacing.xs },
  crosshairWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  crosshair: { color: colors.primary, fontSize: 56, fontWeight: '300' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: 'rgba(18,18,18,0.94)',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  notice: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    padding: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '47%', flexGrow: 1, borderWidth: 3 },
  actions: { gap: spacing.sm },
  secondary: { flex: 1 },
  primary: { flex: 1.6 },
});
