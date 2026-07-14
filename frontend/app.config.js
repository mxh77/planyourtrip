const path = require('path');
const { withAndroidManifest } = require('@expo/config-plugins');

const IS_DEV = process.env.APP_VARIANT === 'development';

const envFile = IS_DEV ? '.env' : (
  require('fs').existsSync(path.resolve(__dirname, '.env.production'))
    ? '.env.production'
    : '.env'
);
require('dotenv').config({ path: path.resolve(__dirname, envFile) });

module.exports = ({ config }) => {
  const finalConfig = {
    ...config,
    name: IS_DEV ? 'PlanYourTrip_Debug' : 'PlanYourTrip',
    slug: 'planyourtrip',
    scheme: IS_DEV ? 'planyourtrip-dev' : 'planyourtrip',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#090909',
    },
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#090909',
      },
      edgeToEdgeEnabled: true,
      package: IS_DEV
        ? 'com.mxh7777.planyourtrip.dev'
        : 'com.mxh7777.planyourtrip',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      googlePlacesApiKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
    },
    plugins: [
      'expo-font',
      '@journeyapps/react-native-quick-sqlite',
      '@react-native-community/datetimepicker',
      'react-native-maps',
    ],
  };

  return withAndroidManifest(finalConfig, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    if (!app['meta-data']) app['meta-data'] = [];
    app['meta-data'] = app['meta-data'].filter(
      (m) => m.$['android:name'] !== 'com.google.android.geo.API_KEY'
    );
    // Only add the API key if it's defined
    if (process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY) {
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.android.geo.API_KEY',
          'android:value': process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
        },
      });
    }
    return cfg;
  });
};
