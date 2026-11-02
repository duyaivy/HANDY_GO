import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Be_Vietnam_Pro } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-be-vietnam",
});

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
    <html lang="vi" className={beVietnamPro.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
