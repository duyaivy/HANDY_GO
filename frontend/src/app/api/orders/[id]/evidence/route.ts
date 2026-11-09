import { proxyOrderRequest } from "../../_proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyOrderRequest(request, {
    method: "GET",
    backendPath: `/orders/${encodeURIComponent(id)}/evidence`,
  });
}
