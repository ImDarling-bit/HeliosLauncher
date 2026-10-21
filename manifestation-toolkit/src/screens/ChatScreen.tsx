import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { ScreenHeader, StatusDot } from '../components/ScreenHeader';
import { CONFIG } from '../config';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { useLocation } from '../context/LocationContext';
import { useHand } from '../hooks/useHand';
import { chatSocket, type SocketStatus } from '../services/chatSocket';
import { colors, font, radius, spacing, touch } from '../theme';
import type { ChatMessage, Coords } from '../types';
import { distanceMeters, formatDistance } from '../utils/geo';
import { tap, warning } from '../utils/haptics';
import { QUICK_MESSAGES, roleIcon, timeAgo } from '../utils/labels';

const STATUS: Record<SocketStatus, { label: string; color: string }> = {
  online: { label: 'En ligne', color: colors.success },
  connecting: { label: 'Connexion…', color: colors.warning },
  offline: { label: 'Hors ligne', color: colors.danger },
};

export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(
    (cb) => chatSocket.on('status', cb),
    () => chatSocket.status
  );
}

export function ChatScreen() {
  const { profile } = useApp();
  const { coords } = useLocation();
  const { row, isRight } = useHand();
  const status = useSocketStatus();
  const { messages, add, markRead } = useChat();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const me = profile ? `${profile.pseudo}#${profile.tag}` : '';

  // Onglet ouvert = messages lus (y compris ceux qui arrivent pendant qu'il est affiché).
  useEffect(() => {
    markRead();
  }, [messages, markRead]);

  const send = (text: string) => {
    if (!profile) return;
    const msg = chatSocket.sendChat(text, profile.role);
    if (!msg) {
      warning();
      setError('Hors ligne : message non envoyé.');
      return;
    }
    setError(null);
    add(msg);
    if (text === draft) setDraft('');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title="Chat local"
        right={<StatusDot label={STATUS[status].label} color={STATUS[status].color} />}
      />
      <Text style={styles.subtitle}>
        Messages dans un rayon de {CONFIG.radiusMeters / 1000} km · position arrondie à ~100 m
      </Text>

      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Bubble msg={item} mine={item.author === me} here={coords} isRight={isRight} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>{"Aucun message pour l'instant."}</Text>
          }
        />

        {/* Zone du pouce : messages rapides + saisie */}
        <View style={styles.composer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quick}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_MESSAGES.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  tap();
                  send(q);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Envoyer : ${q}`}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              >
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.inputRow, { flexDirection: row }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              maxLength={CONFIG.maxMessageLength}
              multiline
              style={styles.input}
              accessibilityLabel="Message"
            />
            <BigButton
              label="Envoyer"
              variant="primary"
              large
              disabled={!draft.trim()}
              onPress={() => send(draft)}
              style={styles.send}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  msg,
  mine,
  here,
  isRight,
}: {
  msg: ChatMessage;
  mine: boolean;
  here: Coords | null;
  isRight: boolean;
}) {
  const where =
    here && msg.latitude !== undefined && msg.longitude !== undefined
      ? formatDistance(
          distanceMeters(here, { latitude: msg.latitude, longitude: msg.longitude })
        )
      : null;
  return (
    <View
      style={[
        styles.bubble,
        mine ? styles.bubbleMine : styles.bubbleOther,
        // Mes messages côté pouce, les autres côté opposé.
        { alignSelf: mine === isRight ? 'flex-end' : 'flex-start' },
      ]}
      accessible
      accessibilityLabel={`${msg.author} : ${msg.text}`}
    >
      <Text style={styles.meta}>
        {roleIcon(msg.role)} {mine ? 'Moi' : msg.author} · {timeAgo(msg.ts)}
        {where ? ` · ${where}` : ''}
      </Text>
      <Text style={styles.text}>{msg.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subtitle: { color: colors.textMuted, fontSize: font.small, paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: 'center', padding: spacing.xl },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  bubbleMine: { backgroundColor: colors.surfaceHigh, borderWidth: 2, borderColor: colors.primary },
  bubbleOther: { backgroundColor: colors.surface },
  meta: { color: colors.textMuted, fontSize: font.small, fontWeight: '700' },
  text: { color: colors.text, fontSize: font.body, lineHeight: 25 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  error: { color: colors.warning, fontSize: font.small, fontWeight: '700', paddingHorizontal: spacing.lg },
  quick: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  inputRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: touch.primary,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: font.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  send: { minWidth: 110 },
});
