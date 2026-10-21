// Thème unique : sombre permanent, contrastes élevés, cibles tactiles larges.
export const colors = {
  bg: '#121212',
  surface: '#1E1E1E',
  surfaceHigh: '#2C2C2C',
  border: '#4A4A4A',
  text: '#FFFFFF',
  textMuted: '#C7C7C7',
  // Jaune vif sur fond noir : contraste ~14:1. Texte noir dessus.
  primary: '#FFD600',
  onPrimary: '#000000',
  // Rouge assez sombre pour garder un texte blanc lisible (> 4.5:1).
  danger: '#C62828',
  onDanger: '#FFFFFF',
  success: '#00E676',
  warning: '#FF9100',
  info: '#40C4FF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const touch = {
  // Hauteur minimale de toute cible tactile (règle du projet).
  min: 56,
  // Actions principales : encore plus grandes.
  primary: 64,
} as const;

export const font = {
  body: 18,
  large: 21,
  title: 28,
  small: 15,
} as const;

export const radius = {
  md: 12,
  lg: 18,
  pill: 999,
} as const;
