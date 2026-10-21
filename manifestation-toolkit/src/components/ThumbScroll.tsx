import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '../theme';

/**
 * ScrollView dont le contenu est collé en BAS quand il tient dans l'écran :
 * les contrôles restent dans la zone du pouce au lieu de partir vers le haut.
 */
export function ThumbScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    gap: spacing.lg,
  },
});
