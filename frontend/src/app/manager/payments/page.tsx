import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/constants/route";

export default function PaymentPage() {
  redirect(ROUTES.manageR.PAYMENTS.TRANSACTIONS);
}
