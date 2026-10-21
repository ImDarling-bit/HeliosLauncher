import * as Haptics from 'expo-haptics';

// Retour haptique : confirme une action sans avoir à regarder l'écran.
// Les erreurs sont ignorées (appareils sans vibreur, simulateurs).
export const tap = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const success = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

export const warning = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
};
