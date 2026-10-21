import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CONFIG } from '../config';
import { useApp } from '../context/AppContext';
import { colors, radius, touch } from '../theme';
import { tap, warning } from '../utils/haptics';

/**
 * Bouton d'urgence : maintenir ~0,8 s pour tout purger.
 * L'appui maintenu évite une purge accidentelle quand on court ou qu'on
 * tremble, tout en restant un seul geste du pouce. La jauge rouge montre la
 * progression : relâcher avant la fin annule.
 */
export function PanicButton() {
  const { panic } = useApp();
  const [progress] = useState(() => new Animated.Value(0));
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  const start = () => {
    tap();
    anim.current?.stop();
    anim.current = Animated.timing(progress, {
      toValue: 1,
      duration: CONFIG.panicHoldMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (!finished) return;
      warning();
      void panic();
    });
  };

  const cancel = () => {
    anim.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const height = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Purge d'urgence"
      accessibilityHint="Maintenir appuyé pour effacer toutes les données de l'application"
      onPressIn={start}
      onPressOut={cancel}
      hitSlop={8}
      style={styles.button}
    >
      <Animated.View style={[styles.fill, { height }]} />
      <View style={styles.content} pointerEvents="none">
        <Text style={styles.icon}>⛔</Text>
        <Text style={styles.label}>PURGE</Text>
        <Text style={styles.hint}>maintenir</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 84,
    minHeight: touch.primary + 8,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.danger,
  },
  content: { alignItems: 'center' },
  icon: { fontSize: 20 },
  label: { color: colors.text, fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  hint: { color: colors.textMuted, fontSize: 11 },
});
