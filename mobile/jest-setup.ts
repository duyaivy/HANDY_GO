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

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    {
      languageTag: 'en-US',
      languageCode: 'en',
      textDirection: 'ltr',
      digitGroupingSeparator: ',',
      decimalSeparator: '.',
      measurementSystem: 'metric',
      currencyCode: 'USD',
      currencySymbol: '$',
      regionCode: 'US',
    },
  ]),
}));

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
