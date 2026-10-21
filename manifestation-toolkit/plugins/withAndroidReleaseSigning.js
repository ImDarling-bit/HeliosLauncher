// Config plugin : signe l'APK release avec ta propre clé si les variables
// d'environnement sont présentes au moment du build Gradle, sinon retombe sur
// la clé de debug du template Expo (APK installable, mais pas pour le Play Store).
//
// Variables lues par Gradle :
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
//   ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @manifestation-toolkit release-signing';

const RELEASE_SIGNING = `
        ${MARKER}
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;

    const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
    // Le bloc release *dans buildTypes* (pas celui de signingConfigs).
    const releaseUsesDebug =
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;

    if (!debugBlock.test(gradle) || !releaseUsesDebug.test(gradle)) {
      throw new Error(
        '[withAndroidReleaseSigning] build.gradle inattendu : mets à jour le plugin.'
      );
    }

    gradle = gradle.replace(
      releaseUsesDebug,
      "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug"
    );
    gradle = gradle.replace(debugBlock, `$1${RELEASE_SIGNING}`);
    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = withAndroidReleaseSigning;
