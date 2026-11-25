import { proxyOperationRequest } from "../../operations-proxy";

export function POST(request: Request) {
  return proxyOperationRequest({
    request,
    method: "POST",
    backendPath: "/payments/admin/operations/reconcile",
  });
}
