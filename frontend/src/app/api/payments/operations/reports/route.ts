import { proxyOperationRequest } from "../../operations-proxy";

export function GET(request: Request) {
  return proxyOperationRequest({
    request,
    method: "GET",
    backendPath: "/payments/admin/operations/reports",
    queryKeys: ["page", "limit"],
  });
}
