import type { ExpoConfig } from 'expo/config';

// Clés et URLs injectées au build (variables d'environnement / secrets CI).
// Rien de sensible n'est commité dans le dépôt.
const GOOGLE_MAPS_ANDROID_KEY = process.env.GOOGLE_MAPS_ANDROID_KEY || '';
// Version issue du tag Git en CI (toolkit-v1.2.3 → 1.2.3), numéro de build = run CI.
const VERSION = process.env.APP_VERSION || '1.0.0';
const BUILD_NUMBER = Number(process.env.APP_BUILD_NUMBER || 1);

const config: ExpoConfig = {
  name: 'Manifestation Toolkit',
  slug: 'manifestation-toolkit',
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Mode sombre permanent : l'app ignore le thème du système.
  userInterfaceStyle: 'dark',
  backgroundColor: '#121212',
  ios: {
    bundleIdentifier: 'org.manifestationtoolkit.app',
    buildNumber: String(BUILD_NUMBER),
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'org.manifestationtoolkit.app',
    versionCode: BUILD_NUMBER,
    adaptiveIcon: {
      backgroundColor: '#121212',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Uniquement la localisation au premier plan : jamais en arrière-plan.
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION'],
    // Pas de sauvegarde cloud Android des données locales (anonymat).
    allowBackup: false,
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          "Ta position (arrondie à ~100 m) sert à recevoir le chat local et à placer les signalements sur la carte. Elle n'est jamais utilisée en arrière-plan.",
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: GOOGLE_MAPS_ANDROID_KEY,
      },
    ],
    './plugins/withAndroidReleaseSigning',
  ],
};

export default config;
