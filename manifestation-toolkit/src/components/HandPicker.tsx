import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import type { Hand } from '../types';
import { BigButton } from './BigButton';

/** Sélecteur Gaucher / Droitier : deux gros boutons, gauche à gauche. */
export function HandPicker({ value, onChange }: { value: Hand; onChange: (h: Hand) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      <BigButton
        label="Main gauche"
        icon="🤚"
        variant={value === 'left' ? 'selected' : 'secondary'}
        onPress={() => onChange('left')}
        style={styles.item}
      />
      <BigButton
        label="Main droite"
        icon="✋"
        variant={value === 'right' ? 'selected' : 'secondary'}
        onPress={() => onChange('right')}
        style={styles.item}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  item: { flex: 1 },
});
