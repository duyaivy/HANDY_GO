import { PAYMENT_ID_PATTERN } from "@/feature/payments/schemas/payment.schema";
import { proxyRefundRequest } from "../../../refunds-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PAYMENT_ID_PATTERN.test(id)) {
    return Response.json({ message: "Mã yêu cầu hoàn tiền không hợp lệ" }, { status: 400 });
  }

  return proxyRefundRequest({
    request,
    method: "POST",
    backendPath: `/payments/admin/refunds/${encodeURIComponent(id)}/decision`,
  });
}
