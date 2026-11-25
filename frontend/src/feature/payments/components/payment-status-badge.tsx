import { PAYMENT_STATUSES } from "../payment-utils";
import type { PaymentStatus } from "../types";

export default function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, color } = PAYMENT_STATUSES[status];

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
