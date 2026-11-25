import { PAYMENT_ID_PATTERN } from "@/feature/payments/schemas/payment.schema";
import { proxyPaymentRecords } from "../_proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!PAYMENT_ID_PATTERN.test(id)) {
    return Response.json(
      { message: "Mã giao dịch không hợp lệ" },
      { status: 400 },
    );
  }

  return proxyPaymentRecords(request, id);
}
