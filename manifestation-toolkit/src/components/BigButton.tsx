import { Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing, touch } from '../theme';
import { tap } from '../utils/haptics';

type Variant = 'primary' | 'secondary' | 'danger' | 'selected';

interface Props {
  label: string;
  icon?: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Bouton principal : hauteur 64 au lieu de 56. */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const BG: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.surfaceHigh,
  danger: colors.danger,
  selected: colors.primary,
};
const FG: Record<Variant, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  danger: colors.onDanger,
  selected: colors.onPrimary,
};

export function BigButton({
  label,
  icon,
  onPress,
  variant = 'secondary',
  disabled,
  large,
  style,
  accessibilityHint,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: variant === 'selected' }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: large ? touch.primary : touch.min, backgroundColor: BG[variant] },
        variant === 'secondary' && styles.outlined,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        numberOfLines={2}
        style={[styles.label, { color: FG[variant], fontSize: large ? font.large : font.body }]}
      >
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: {
    borderWidth: 2,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  label: { fontWeight: '800', textAlign: 'center' },
});
