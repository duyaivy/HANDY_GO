import type { AppLocale } from "@/shared/i18n/locale.types";
import { cn, formatCurrency } from "@/shared/lib/utils";

interface PriceDisplayProps {
  price: number;
  priceUsd?: number | null;
  locale: AppLocale;
  className?: string;
  vndClassName?: string;
  usdClassName?: string;
}

function formatUsdCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function PriceDisplay({
  price,
  priceUsd,
  locale,
  className,
  vndClassName,
  usdClassName,
}: PriceDisplayProps) {
  const shouldShowUsd = locale === "en";

  return (
    <div
      className={cn(
        "flex flex-row justify-between w-full items-center gap-3",
        className,
      )}
    >
      <span className={vndClassName}>{formatCurrency(price)}</span>
      {shouldShowUsd ? (
        <span className={cn("text-md text-muted-foreground", usdClassName)}>
          ~{formatUsdCurrency(priceUsd || price / 25000)}
        </span>
      ) : null}
    </div>
  );
}
