import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import type { Role } from '../types';
import { ROLES } from '../utils/labels';
import { BigButton } from './BigButton';

/** Grille 2×2 : quatre grosses cibles, aucune liste à faire défiler. */
export function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {ROLES.map((r) => (
        <BigButton
          key={r.id}
          label={r.label}
          icon={r.icon}
          variant={value === r.id ? 'selected' : 'secondary'}
          onPress={() => onChange(r.id)}
          style={styles.cell}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexBasis: '47%', flexGrow: 1 },
});
