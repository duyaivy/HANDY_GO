import { proxyRefundRequest } from "../refunds-proxy";

export function GET(request: Request) {
  return proxyRefundRequest({
    request,
    method: "GET",
    backendPath: "/payments/admin/refunds",
    queryKeys: ["page", "limit", "paymentId", "status"],
  });
}
