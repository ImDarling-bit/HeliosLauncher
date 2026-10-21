import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';

/**
 * En-tête purement informatif : le haut de l'écran est hors de portée du
 * pouce, donc on n'y met jamais d'action.
 */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

export function StatusDot({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.status} accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: '900', flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { color: colors.textMuted, fontSize: font.small, fontWeight: '700' },
});
