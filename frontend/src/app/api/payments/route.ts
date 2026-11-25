import { proxyPaymentRecords } from "./_proxy";

export function GET(request: Request) {
  return proxyPaymentRecords(request);
}
