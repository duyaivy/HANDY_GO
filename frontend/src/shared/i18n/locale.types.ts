export const SUPPORTED_LOCALES = ["vi", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleText = {
  vi?: string | null;
  en?: string | null;
};
