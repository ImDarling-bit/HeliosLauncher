import type { ViewStyle } from 'react-native';

import { useApp } from '../context/AppContext';
import { spacing } from '../theme';

/**
 * Règle unique de placement pour toute l'app : dans une rangée, on écrit les
 * enfants dans l'ordre [secondaire…, PRINCIPAL]. `row` place alors l'action
 * principale sous le pouce : à droite pour un droitier, à gauche pour un gaucher.
 */
export function useHand() {
  const { settings } = useApp();
  const isRight = settings.hand === 'right';
  return {
    hand: settings.hand,
    isRight,
    row: (isRight ? 'row' : 'row-reverse') as ViewStyle['flexDirection'],
    /** Alignement d'un élément isolé côté pouce. */
    align: (isRight ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start',
    /** Positionnement absolu côté pouce. */
    edge: (offset: number = spacing.lg): ViewStyle =>
      isRight ? { right: offset } : { left: offset },
  };
}
