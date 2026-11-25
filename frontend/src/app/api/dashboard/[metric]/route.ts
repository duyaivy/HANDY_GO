
import { NextRequest, NextResponse } from "next/server";
import { proxyDashboard } from "../proxy";


const ALLOWED_METRICS = [
  "overview",
  "order-trend",
  "order-status",
  "top-workers",
  "top-services",
] as const;

type DashboardMetric = (typeof ALLOWED_METRICS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metric: string }> },
) {
  const { metric } = await params;

  if (!ALLOWED_METRICS.includes(metric as DashboardMetric)) {
    return NextResponse.json(
      { message: "Dashboard API không hợp lệ" },
      { status: 404 },
    );
  }

  return proxyDashboard(request, metric);
}
