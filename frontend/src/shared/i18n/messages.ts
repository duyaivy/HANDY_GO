import { AppLocale } from "@/shared/i18n/locale.types";

export const DEFAULT_LOCALE: AppLocale = "vi";

export const LOCALE_STORAGE_KEY = "app-locale";

const messages = {
  vi: {
    appTitle: "Bigboy Restaurant",
    menu: "Menu",
    cart: "Gio hang",
    order: "Don hang",
    categories: "Danh muc",
    dishesSuffix: "mon",
    noDishFound: "Khong tim thay mon an nao",
    searchPlaceholder: "Tim kiem mon an...",
    loading: "Dang tai...",
    productNotFound: "Khong tim thay san pham",
    description: "Mo ta",
    note: "Ghi chu",
    notePlaceholder: "Vi du: khong cay, it muoi...",
    quantity: "So luong",
    subtotal: "Tam tinh",
    addedToCart: "Da them vao gio",
    addToCart: "Them vao gio hang",
    guestLoginLabel: "Vui long nhap ten cua quy khach",
    guestLoginPlaceholder: "Ten cua ban...",
    enterStore: "Vao cua hang",
    servingWithCare: "Phuc vu tan tam",
    loginSuccessTitle: "Dang nhap thanh cong",
    loginErrorTitle: "Dang nhap that bai",
    fineDining: "Fine Dining",
  },
  en: {
    appTitle: "Bigboy Restaurant",
    menu: "Menu",
    cart: "Cart",
    order: "Orders",
    categories: "Categories",
    dishesSuffix: "dishes",
    noDishFound: "No dishes found",
    searchPlaceholder: "Search dishes...",
    loading: "Loading...",
    productNotFound: "Product not found",
    description: "Description",
    note: "Note",
    notePlaceholder: "Example: less spicy, less salt...",
    quantity: "Quantity",
    subtotal: "Subtotal",
    addedToCart: "Added to cart",
    addToCart: "Add to cart",
    guestLoginLabel: "Please enter your name",
    guestLoginPlaceholder: "Your name...",
    enterStore: "Enter store",
    servingWithCare: "Serving with care",
    loginSuccessTitle: "Login successful",
    loginErrorTitle: "Login failed",
    fineDining: "Fine Dining",
  },
} as const;

export type AppMessageKey = keyof (typeof messages)["vi"];

export function getMessage(locale: AppLocale, key: AppMessageKey): string {
  return messages[locale][key] ?? messages.vi[key];
}
