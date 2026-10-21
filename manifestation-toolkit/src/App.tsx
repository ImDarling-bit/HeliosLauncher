import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { type TabId, ThumbTabBar } from './components/ThumbTabBar';
import { CONFIG } from './config';
import { AppProvider, useApp } from './context/AppContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { LocationProvider, useLocation } from './context/LocationContext';
import { chatSocket } from './services/chatSocket';
import { ChatScreen } from './screens/ChatScreen';
import { MapScreen } from './screens/MapScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WikiScreen } from './screens/WikiScreen';
import { colors } from './theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { ready, profile, settings, sessionKey } = useApp();

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // `key` change à chaque purge : tout l'arbre (et son état en mémoire) repart à zéro.
  return (
    <View key={sessionKey} style={styles.root}>
      {profile ? (
        <LocationProvider enabled={settings.shareLocation}>
          <ChatProvider>
            <Main />
          </ChatProvider>
        </LocationProvider>
      ) : (
        <OnboardingScreen />
      )}
    </View>
  );
}

function Main() {
  const { profile } = useApp();
  const { shared } = useLocation();
  const { unread } = useChat();
  const [tab, setTab] = useState<TabId>('map');
  const name = profile ? `${profile.pseudo}#${profile.tag}` : '';
  const role = profile?.role ?? 'user';

  // Connexion WebSocket ouverte tant que le profil existe.
  useEffect(() => {
    if (!name) return;
    chatSocket.connect(CONFIG.wsUrl, { name, role }, shared);
    return () => chatSocket.shutdown();
    // La position est mise à jour séparément, sans reconnexion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, role]);

  useEffect(() => {
    chatSocket.updatePosition(shared);
  }, [shared]);

  // Bouton retour Android : revient à la carte avant de quitter l'app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'map') return false;
      setTab('map');
      return true;
    });
    return () => sub.remove();
  }, [tab]);

  return (
    <View style={styles.root}>
      <View style={styles.root}>
        {tab === 'map' && <MapScreen />}
        {tab === 'chat' && <ChatScreen />}
        {tab === 'wiki' && <WikiScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <ThumbTabBar active={tab} onChange={setTab} badges={{ chat: tab === 'chat' ? 0 : unread }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
