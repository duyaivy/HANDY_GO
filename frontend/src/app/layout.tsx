import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Handy Go - Ứng Dụng Đặt Thợ Nhanh Chóng & Tin Cậy",
  description:
    "Nền tảng kết nối thợ sửa chữa gia đình hàng đầu. Đặt lịch siêu tốc trên điện thoại trong 15 phút, thợ tay nghề cao, xác minh danh tính 100%.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={cn("font-sans", geist.variable)}>
      <body>
        {" "}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
