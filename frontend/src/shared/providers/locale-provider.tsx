"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppLocale,
  SUPPORTED_LOCALES,
} from "@/shared/i18n/locale.types";
import {
  DEFAULT_LOCALE,
  getMessage,
  LOCALE_STORAGE_KEY,
  AppMessageKey,
} from "@/shared/i18n/messages";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  toggleLocale: () => void;
  t: (key: AppMessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function parseLocale(input: string | null): AppLocale {
  if (!input) {
    return DEFAULT_LOCALE;
  }

  if ((SUPPORTED_LOCALES as readonly string[]).includes(input)) {
    return input as AppLocale;
  }

  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    const savedLocale = parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    setLocaleState(savedLocale);
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const toggleLocale = useCallback(() => {
    const nextLocale = locale === "vi" ? "en" : "vi";
    setLocale(nextLocale);
  }, [locale, setLocale]);

  const t = useCallback(
    (key: AppMessageKey) => {
      return getMessage(locale, key);
    },
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
    }),
    [locale, setLocale, toggleLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocaleContext must be used inside LocaleProvider");
  }

  return context;
}
