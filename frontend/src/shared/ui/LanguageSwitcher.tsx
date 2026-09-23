"use client";

import { Button } from "@/shared/ui/button";
import { useLocale } from "next-intl";
import { setLocaleAction } from "@/shared/i18n/actions";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSetLocale = (nextLocale: "vi" | "en") => {
    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-1 gap-1">
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        variant={locale === "vi" ? "default" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => handleSetLocale("vi")}
      >
        VI
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        variant={locale === "en" ? "default" : "ghost"}
        className="h-7 px-2 text-xs"
        onClick={() => handleSetLocale("en")}
      >
        EN
      </Button>
    </div>
  );
}
