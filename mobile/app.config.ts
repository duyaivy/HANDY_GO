/* eslint-disable max-lines-per-function */
/* eslint-disable perfectionist/sort-imports -- Register TypeScript and load .env before evaluating build modules. */
import type { ConfigContext, ExpoConfig } from '@expo/config';
import 'tsx/cjs';
import 'dotenv/config';
import Env from './env';
import { resolveGoogleServicesFile } from './scripts/firebase-config';

const EXPO_ACCOUNT_OWNER = 'handygo';
const EAS_PROJECT_ID = 'c3e1075b-6fe7-4686-aa49-35b46a229044';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: Env.EXPO_PUBLIC_NAME,
  description: `${Env.EXPO_PUBLIC_NAME} Mobile App`,
  owner: EXPO_ACCOUNT_OWNER,
  scheme: Env.EXPO_PUBLIC_SCHEME,
  slug: 'handy-go-mobile',
  version: Env.EXPO_PUBLIC_VERSION.toString(),
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: Env.EXPO_PUBLIC_BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  experiments: {
    typedRoutes: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    package: Env.EXPO_PUBLIC_PACKAGE,
    googleServicesFile: resolveGoogleServicesFile({
      projectRoot: __dirname,
      androidPackage: Env.EXPO_PUBLIC_PACKAGE,
      base64: process.env.GOOGLE_SERVICES_JSON_BASE64,
      filePath: process.env.GOOGLE_SERVICES_JSON,
    }),
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/splash-icon.png',
        imageWidth: 150,
      },
    ],
    [
      'expo-font',
      {
        ios: {
          fonts: [
            'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
            'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
            'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
            'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
          ],
        },
        android: {
          fonts: [
            {
              fontFamily: 'Inter',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf',
                  weight: 400,
                },
                {
                  path: 'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
                  weight: 500,
                },
                {
                  path: 'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
                  weight: 600,
                },
                {
                  path: 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf',
                  weight: 700,
                },
              ],
            },
          ],
        },
      },
    ],
    'expo-localization',
    [
      'expo-camera',
      {
        cameraPermission: 'Cho phép HANDY GO sử dụng camera để chụp CCCD xác minh.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Cho phép HANDY GO truy cập thư viện ảnh để tải ảnh hiện trường.',
      },
    ],
    ['expo-notifications', { defaultChannel: 'default' }],
    'expo-router',
    ['react-native-edge-to-edge'],
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken:
          process.env.MAPBOX_DOWNLOADS_TOKEN || Env.MAPBOX_DOWNLOADS_TOKEN || '',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
