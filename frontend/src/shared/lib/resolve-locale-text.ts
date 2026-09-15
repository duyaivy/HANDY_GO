import { AppLocale, LocaleText } from "@/shared/i18n/locale.types";

type LocaleInput = string | LocaleText | null | undefined;

export function resolveLocaleText(value: LocaleInput, locale: AppLocale): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value) {
    return "";
  }

  const byLocale = locale === "vi" ? value.vi : value.en;
  if (typeof byLocale === "string" && byLocale.trim()) {
    return byLocale;
  }

  const fallback = locale === "vi" ? value.en : value.vi;
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }

  return "";
}
