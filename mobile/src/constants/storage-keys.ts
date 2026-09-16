/**
 * Storage keys for MMKV persistent storage.
 * All keys must be declared here to avoid collision and magic strings.
 */
export const StorageKeys = {
  AUTH_TOKEN: 'handy_go_auth_token',
  USER_PROFILE: 'handy_go_user_profile',
  USER_ROLE: 'handy_go_user_role',
  APP_THEME: 'handy_go_app_theme',
  APP_LANGUAGE: 'handy_go_app_language',
  FIRST_TIME_OPEN: 'handy_go_first_time_open',
  DEVICE_NOTIFICATION_TOKEN: 'handy_go_device_push_token',
  SAVED_FAVORITE_WORKERS: 'handy_go_favorite_workers',
} as const;

export type StorageKey = typeof StorageKeys[keyof typeof StorageKeys];
