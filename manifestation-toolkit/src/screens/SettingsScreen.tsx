import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { HandPicker } from '../components/HandPicker';
import { RolePicker } from '../components/RolePicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { Section } from '../components/Section';
import { ThumbScroll } from '../components/ThumbScroll';
import { CONFIG } from '../config';
import { useApp } from '../context/AppContext';
import { useLocation } from '../context/LocationContext';
import { colors, font, radius, spacing } from '../theme';
import { roleIcon, roleLabel } from '../utils/labels';

export function SettingsScreen() {
  const { profile, settings, updateSettings, updateProfile } = useApp();
  const { permission } = useLocation();
  if (!profile) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Réglages" />
      <ThumbScroll>
        <View style={styles.card}>
          <Text style={styles.name}>
            {profile.pseudo}
            <Text style={styles.tag}>#{profile.tag}</Text>
          </Text>
          <Text style={styles.meta}>
            {roleIcon(profile.role)} {roleLabel(profile.role)} · identifiant stocké uniquement sur ce
            téléphone
          </Text>
        </View>

        <Section title="Serveurs" hint="Connexion chiffrée à tes serveurs privés.">
          <Text style={styles.mono}>{CONFIG.wsUrl}</Text>
          <Text style={styles.mono}>{CONFIG.apiUrl}</Text>
        </Section>

        <Section
          title="Position"
          hint={
            permission === 'denied'
              ? 'Localisation refusée dans les réglages du téléphone.'
              : 'Arrondie à ~100 m avant envoi. Jamais en arrière-plan.'
          }
        >
          <BigButton
            label={settings.shareLocation ? 'Partage de position : OUI' : 'Partage de position : NON'}
            icon={settings.shareLocation ? '📍' : '🚫'}
            variant={settings.shareLocation ? 'selected' : 'secondary'}
            onPress={() => updateSettings({ shareLocation: !settings.shareLocation })}
          />
        </Section>

        <Section title="Rôle">
          <RolePicker value={profile.role} onChange={(role) => updateProfile({ role })} />
        </Section>

        <Section
          title="Main maîtresse"
          hint="Les boutons principaux et PURGE passent du côté de ton pouce."
        >
          <HandPicker value={settings.hand} onChange={(hand) => updateSettings({ hand })} />
        </Section>
      </ThumbScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  name: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  tag: { color: colors.primary },
  meta: { color: colors.textMuted, fontSize: font.small },
  mono: { color: colors.textMuted, fontSize: font.small, fontFamily: 'monospace' },
});
