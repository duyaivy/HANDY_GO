/* eslint-disable ts/ban-ts-comment */
/* eslint-disable no-restricted-globals */

// Mock react-native-worklets first
jest.mock('react-native-worklets', () => ({
  __esModule: true,
  default: {},
}));

// Mock @dev-plugins/react-query
jest.mock('@dev-plugins/react-query', () => ({
  useReactQueryDevTools: jest.fn(),
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;

  return {
    __esModule: true,
    default: {
      View,
      ScrollView: View,
      createAnimatedComponent: (component: any) => component,
    },
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(fn => fn()),
    withTiming: jest.fn(value => value),
    withSpring: jest.fn(value => value),
    withDecay: jest.fn(value => value),
    withDelay: jest.fn((_, value) => value),
    withRepeat: jest.fn(value => value),
    withSequence: jest.fn((...values) => values[0]),
    cancelAnimation: jest.fn(),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      bezier: jest.fn(),
      in: jest.fn(fn => fn),
      out: jest.fn(fn => fn),
      inOut: jest.fn(fn => fn),
    },
    FadeIn: { duration: jest.fn(() => ({})) },
    FadeOut: { duration: jest.fn(() => ({})) },
    FadeInDown: { duration: jest.fn(() => ({})) },
    FadeInUp: { duration: jest.fn(() => ({})) },
    FadeInLeft: { duration: jest.fn(() => ({})) },
    FadeInRight: { duration: jest.fn(() => ({})) },
    SlideInDown: { duration: jest.fn(() => ({})) },
    SlideInUp: { duration: jest.fn(() => ({})) },
    SlideInLeft: { duration: jest.fn(() => ({})) },
    SlideInRight: { duration: jest.fn(() => ({})) },
    Layout: {},
    Keyframe: jest.fn(),
  };
});

// Mock react-native-mmkv
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, any>();
  const createInstance = () => ({
    set: jest.fn((key: string, value: any) => {
      store.set(key, String(value));
    }),
    getString: jest.fn((key: string) => store.get(key) ?? undefined),
    getNumber: jest.fn((key: string) => {
      const val = store.get(key);
      return val !== undefined ? Number(val) : undefined;
    }),
    getBoolean: jest.fn((key: string) => {
      const val = store.get(key);
      return val !== undefined ? val === 'true' || val === true : undefined;
    }),
    delete: jest.fn((key: string) => {
      store.delete(key);
    }),
    remove: jest.fn((key: string) => {
      store.delete(key);
    }),
    contains: jest.fn((key: string) => store.has(key)),
    clearAll: jest.fn(() => {
      store.clear();
    }),
    getAllKeys: jest.fn(() => Array.from(store.keys())),
  });

  return {
    MMKV: jest.fn(createInstance),
    createMMKV: jest.fn(createInstance),
    useMMKVString: jest.fn((key: string) => [store.get(key), (val: string) => store.set(key, val)]),
    useMMKVNumber: jest.fn((key: string) => [store.get(key) ? Number(store.get(key)) : undefined, (val: number) => store.set(key, String(val))]),
    useMMKVBoolean: jest.fn((key: string) => [store.get(key) === 'true', (val: boolean) => store.set(key, String(val))]),
    useMMKVObject: jest.fn((key: string) => [store.get(key) ? JSON.parse(store.get(key)) : undefined, (val: any) => store.set(key, JSON.stringify(val))]),
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItem: jest.fn((key: string) => {
      store.delete(key);
    }),
  };
});

// Global window object setup for React Native testing
// @ts-expect-error
global.window = {};

// @ts-expect-error
global.window = global;

// Mock react-native-keyboard-controller
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { ScrollView } = require('react-native');
  const mock = require('react-native-keyboard-controller/jest');
  return {
    ...mock,
    KeyboardAwareScrollView: (props: any) =>
      React.createElement(ScrollView, props),
    KeyboardProvider: ({ children }: any) => children,
  };
});

// Mock @rnmapbox/maps
jest.mock('@rnmapbox/maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      setAccessToken: jest.fn(),
      setTelemetryEnabled: jest.fn(),
      requestAndroidLocationPermissions: jest.fn(async () => true),
      MapView: (props: any) => React.createElement(View, { testID: 'mapbox-map-view', ...props }),
      Camera: (props: any) => React.createElement(View, { testID: 'mapbox-camera', ...props }),
      PointAnnotation: (props: any) => React.createElement(View, { testID: 'mapbox-point-annotation', ...props }),
      MarkerView: (props: any) => React.createElement(View, { testID: 'mapbox-marker-view', ...props }),
      ShapeSource: (props: any) => React.createElement(View, { testID: 'mapbox-shape-source', ...props }),
      LineLayer: (props: any) => React.createElement(View, { testID: 'mapbox-line-layer', ...props }),
      CircleLayer: (props: any) => React.createElement(View, { testID: 'mapbox-circle-layer', ...props }),
      UserLocation: (props: any) => React.createElement(View, { testID: 'mapbox-user-location', ...props }),
      StyleURL: {
        Street: 'mapbox://styles/mapbox/streets-v12',
        Outdoors: 'mapbox://styles/mapbox/outdoors-v12',
        Light: 'mapbox://styles/mapbox/light-v11',
        Dark: 'mapbox://styles/mapbox/dark-v11',
        Satellite: 'mapbox://styles/mapbox/satellite-v9',
      },
    },
    MapView: (props: any) => React.createElement(View, { testID: 'mapbox-map-view', ...props }),
    Camera: (props: any) => React.createElement(View, { testID: 'mapbox-camera', ...props }),
    PointAnnotation: (props: any) => React.createElement(View, { testID: 'mapbox-point-annotation', ...props }),
    MarkerView: (props: any) => React.createElement(View, { testID: 'mapbox-marker-view', ...props }),
    UserLocation: (props: any) => React.createElement(View, { testID: 'mapbox-user-location', ...props }),
    StyleURL: {
      Street: 'mapbox://styles/mapbox/streets-v12',
      Outdoors: 'mapbox://styles/mapbox/outdoors-v12',
      Light: 'mapbox://styles/mapbox/light-v11',
      Dark: 'mapbox://styles/mapbox/dark-v11',
      Satellite: 'mapbox://styles/mapbox/satellite-v9',
    },
  };
});

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    CameraView: ({ ref, ...props }: any) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: jest.fn(async () => ({ uri: 'https://res.cloudinary.com/demo/image/upload/sample_camera.jpg', width: 800, height: 600 })),
      }));
      return React.createElement(View, { testID: 'mock-camera-view', ...props });
    },
    useCameraPermissions: jest.fn(() => [
      { granted: true, canAskAgain: true },
      jest.fn(async () => ({ granted: true })),
    ]),
  };
});

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'https://res.cloudinary.com/demo/image/upload/sample_picker.jpg', width: 800, height: 600 }],
  })),
  launchCameraAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'https://res.cloudinary.com/demo/image/upload/sample_camera.jpg', width: 800, height: 600 }],
  })),
  MediaTypeOptions: {
    Images: 'images',
    Videos: 'videos',
    All: 'all',
  },
}));

// Teardown react-query cache, active queries, and timers after each test
afterEach(() => {
  try {
    const { queryClient } = require('@/lib/api/query-client');
    queryClient.cancelQueries();
    queryClient.clear();
  }
  catch {
    // ignore if module resolution fails in isolated test
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: 'test-native-token' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
}));
