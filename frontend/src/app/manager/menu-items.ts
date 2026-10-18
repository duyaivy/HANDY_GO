export interface SubMenuItem {
  title: string;
  href: string;
}

export interface MenuItem {
  title: string;
  href?: string;
  icon?: string;
  subItems?: SubMenuItem[];
}

export const manageMenuItems: MenuItem[] = [
  {
    title: "Dashboard",
    href: "/manager/dashboard",
  },
  {
    title: "Người dùng",
    subItems: [
      { title: "Khách hàng", href: "/manager/customers" },
      { title: "Thợ", href: "/manager/craftsmen" },
    ],
  },
  {
    title: "Dịch vụ",
    subItems: [
      { title: "Danh mục", href: "/manager/categories" },
      { title: "Dịch vụ", href: "/managerr/services" },
    ],
  },
  {
    title: "Booking",
    href: "/manager/bookings",
  },
  {
    title: "Khiếu nại",
    href: "/manager/complaints",
  },
  {
    title: "Đánh giá",
    href: "/manager/reviews",
  },
  {
    title: "Thanh toán",
    href: "/manager/payments",
  },
  {
    title: "Thống kê",
    href: "/manager/statistics",
  },
];
