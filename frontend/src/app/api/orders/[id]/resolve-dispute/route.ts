import { proxyOrderRequest } from "../../_proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyOrderRequest(request, {
    method: "POST",
    backendPath: `/admin/orders/${encodeURIComponent(id)}/resolve-dispute`,
  });
}
