import { proxyOrderRequest } from "./_proxy";

const QUERY_KEYS = [
  "page",
  "limit",
  "status",
  "paymentState",
  "customerUserId",
  "workerUserId",
];

export function GET(request: Request) {
  return proxyOrderRequest(request, {
    method: "GET",
    backendPath: "/admin/orders",
    queryKeys: QUERY_KEYS,
  });
}
