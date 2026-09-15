"use client";

import { useLocaleText } from "@/shared/hooks/use-locale-text";
import { LocaleText } from "@/shared/i18n/locale.types";

export function LocalizedText({ text }: { text?: string | LocaleText | null }) {
    const resolve = useLocaleText();
    return <>{resolve(text)}</>;
}
