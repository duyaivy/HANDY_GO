import { PAYMENT_ID_PATTERN } from "@/feature/payments/schemas/payment.schema";
import { proxyOperationRequest } from "../../../../operations-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PAYMENT_ID_PATTERN.test(id)) {
    return Response.json({ message: "Mã payout không hợp lệ" }, { status: 400 });
  }
  return proxyOperationRequest({
    request,
    method: "POST",
    backendPath: `/payments/admin/operations/payouts/${encodeURIComponent(id)}/resolve-sandbox`,
  });
}
