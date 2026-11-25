import { PAYMENT_ID_PATTERN } from "@/feature/payments/schemas/payment.schema";
import { proxyRefundRequest } from "../../refunds-proxy";

type RouteContext = { params: Promise<{ id: string }> };

async function paymentId(context: RouteContext) {
  const { id } = await context.params;
  return PAYMENT_ID_PATTERN.test(id) ? id : null;
}

export async function GET(request: Request, context: RouteContext) {
  const id = await paymentId(context);
  if (!id) return Response.json({ message: "Mã giao dịch không hợp lệ" }, { status: 400 });

  return proxyRefundRequest({
    request,
    method: "GET",
    backendPath: `/payments/admin/${encodeURIComponent(id)}/refunds`,
    queryKeys: ["page", "limit"],
  });
}

export async function POST(request: Request, context: RouteContext) {
  const id = await paymentId(context);
  if (!id) return Response.json({ message: "Mã giao dịch không hợp lệ" }, { status: 400 });

  return proxyRefundRequest({
    request,
    method: "POST",
    backendPath: `/payments/admin/${encodeURIComponent(id)}/refunds`,
  });
}
