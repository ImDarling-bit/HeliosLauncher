import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHand } from '../hooks/useHand';
import { colors, spacing, touch } from '../theme';
import { tap } from '../utils/haptics';
import { PanicButton } from './PanicButton';

export type TabId = 'map' | 'chat' | 'wiki' | 'settings';

// Par ordre de priorité : le premier est placé le plus près du pouce.
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'map', label: 'Carte', icon: '🗺️' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'wiki', label: 'Droits', icon: '⚖️' },
  { id: 'settings', label: 'Réglages', icon: '⚙️' },
];

/**
 * Barre de navigation unique, collée en bas de l'écran.
 * Le bouton PURGE est dans le coin côté pouce, puis les onglets par priorité
 * décroissante en s'éloignant du pouce.
 */
export function ThumbTabBar({
  active,
  onChange,
  badges = {},
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  badges?: Partial<Record<TabId, number>>;
}) {
  const { row } = useHand();
  const insets = useSafeAreaInsets();
  // Ordre [moins prioritaire … plus prioritaire, PURGE] + `row` = PURGE sous le pouce.
  const ordered = [...TABS].reverse();

  return (
    <View
      style={[styles.bar, { flexDirection: row, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      accessibilityRole="tablist"
    >
      {ordered.map((t) => {
        const selected = t.id === active;
        const badge = badges[t.id] ?? 0;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityLabel={badge ? `${t.label}, ${badge} nouveaux` : t.label}
            accessibilityState={{ selected }}
            onPress={() => {
              tap();
              onChange(t.id);
            }}
            style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}
          >
            <Text style={styles.icon}>{t.icon}</Text>
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            ) : null}
            <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
      <PanicButton />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    minHeight: touch.primary + 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.surfaceHigh, borderWidth: 2, borderColor: colors.primary },
  pressed: { opacity: 0.6 },
  icon: { fontSize: 24 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  labelActive: { color: colors.primary },
  badge: {
    position: 'absolute',
    top: 4,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: '900' },
});
