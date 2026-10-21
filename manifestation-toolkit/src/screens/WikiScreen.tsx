import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '../components/BigButton';
import { ScreenHeader } from '../components/ScreenHeader';
import wiki from '../data/wiki.json';
import { useHand } from '../hooks/useHand';
import { colors, font, radius, spacing, touch } from '../theme';
import type { WikiArticle } from '../types';
import { tap } from '../utils/haptics';

// Embarqué dans l'app : disponible hors ligne, et non effacé par la purge
// (ce sont des informations publiques).
const ARTICLES = wiki.articles as WikiArticle[];

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function WikiScreen() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const article = ARTICLES.find((a) => a.id === openId) ?? null;

  // Bouton retour Android : ferme la fiche avant de quitter l'onglet.
  useEffect(() => {
    if (!article) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenId(null);
      return true;
    });
    return () => sub.remove();
  }, [article]);

  const sections = useMemo(() => {
    const q = normalize(query.trim());
    const matches = ARTICLES.filter(
      (a) =>
        !q ||
        normalize(`${a.title} ${a.summary} ${a.sections.map((s) => s.heading + ' ' + s.body).join(' ')}`).includes(q)
    );
    const byCat = new Map<string, WikiArticle[]>();
    matches.forEach((a) => byCat.set(a.category, [...(byCat.get(a.category) ?? []), a]));
    return [...byCat.entries()].map(([title, data]) => ({ title, data }));
  }, [query]);

  if (article) return <ArticleView article={article} onClose={() => setOpenId(null)} />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Tes droits" right={<Text style={styles.offline}>Hors ligne ✓</Text>} />
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => <Text style={styles.category}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                tap();
                setOpenId(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityHint={item.summary}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSummary}>{item.summary}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Aucune fiche ne correspond.</Text>}
          ListFooterComponent={<Text style={styles.disclaimer}>{wiki.disclaimer}</Text>}
        />
        {/* Recherche en bas : accessible au pouce. */}
        <View style={styles.searchBar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher : avocat, nasse, gaz…"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Rechercher dans les fiches"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ArticleView({ article, onClose }: { article: WikiArticle; onClose: () => void }) {
  const { row } = useHand();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.article}>
        <Text style={styles.category}>{article.category}</Text>
        <Text style={styles.articleTitle} accessibilityRole="header">
          {article.title}
        </Text>
        {article.sections.map((s) => (
          <View key={s.heading} style={styles.block}>
            <Text style={styles.heading} accessibilityRole="header">
              {s.heading}
            </Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
        <Text style={styles.disclaimer}>
          {wiki.disclaimer} Mise à jour : {wiki.version}.
        </Text>
      </ScrollView>
      <View style={[styles.articleActions, { flexDirection: row }]}>
        <View style={styles.spacer} />
        <BigButton label="Retour aux fiches" icon="←" variant="primary" large onPress={onClose} style={styles.back} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  offline: { color: colors.success, fontSize: font.small, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.sm },
  category: {
    color: colors.primary,
    fontSize: font.small,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  item: {
    minHeight: touch.primary,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  itemTitle: { color: colors.text, fontSize: font.large, fontWeight: '800' },
  itemSummary: { color: colors.textMuted, fontSize: font.body },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: 'center', padding: spacing.xl },
  disclaimer: { color: colors.textMuted, fontSize: font.small, marginTop: spacing.xl, lineHeight: 21 },
  searchBar: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  search: {
    minHeight: touch.min,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: font.body,
    paddingHorizontal: spacing.lg,
  },
  article: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  articleTitle: { color: colors.text, fontSize: font.title, fontWeight: '900' },
  block: { gap: spacing.sm },
  heading: { color: colors.primary, fontSize: font.large, fontWeight: '800' },
  body: { color: colors.text, fontSize: font.body + 1, lineHeight: 28 },
  articleActions: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  spacer: { flex: 0.15 },
  back: { flex: 1 },
});
