import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { HandPicker } from '../components/HandPicker';
import { RolePicker } from '../components/RolePicker';
import { Section } from '../components/Section';
import { ThumbScroll } from '../components/ThumbScroll';
import { useApp } from '../context/AppContext';
import { colors, font, radius, spacing, touch } from '../theme';
import type { Hand, Role } from '../types';
import { success } from '../utils/haptics';

const PSEUDO_MIN = 2;
const PSEUDO_MAX = 20;

export function OnboardingScreen() {
  const { createProfile, settings } = useApp();
  const [pseudo, setPseudo] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [hand, setHand] = useState<Hand>(settings.hand);

  const clean = pseudo.trim();
  const valid = clean.length >= PSEUDO_MIN && clean.length <= PSEUDO_MAX;

  const submit = async () => {
    if (!valid) return;
    success();
    await createProfile(clean, role, hand);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <ThumbScroll>
          <View style={styles.intro}>
            <Text style={styles.title} accessibilityRole="header">
              Manifestation Toolkit
            </Text>
            <Text style={styles.text}>
              Aucun compte, aucun e-mail. Ton identité est un pseudo + un code aléatoire créé sur ce
              téléphone.
            </Text>
          </View>

          <Section title="Ta main" hint="Les boutons principaux se placeront sous ton pouce.">
            <HandPicker value={hand} onChange={setHand} />
          </Section>

          <Section title="Ton rôle">
            <RolePicker value={role} onChange={setRole} />
          </Section>

          <Section title="Ton pseudo" hint="N'utilise pas ton vrai nom.">
            <TextInput
              value={pseudo}
              onChangeText={setPseudo}
              placeholder="ex. Mouette"
              placeholderTextColor={colors.textMuted}
              maxLength={PSEUDO_MAX}
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.input}
              accessibilityLabel="Pseudo"
            />
          </Section>

          <BigButton
            label="Commencer"
            variant="primary"
            large
            disabled={!valid}
            onPress={submit}
            accessibilityHint={`Pseudo de ${PSEUDO_MIN} à ${PSEUDO_MAX} caractères`}
          />
        </ThumbScroll>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  intro: { gap: spacing.sm },
  title: { color: colors.primary, fontSize: font.title + 4, fontWeight: '900' },
  text: { color: colors.text, fontSize: font.body, lineHeight: 26 },
  input: {
    minHeight: touch.primary,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: font.large,
    paddingHorizontal: spacing.lg,
  },
});
