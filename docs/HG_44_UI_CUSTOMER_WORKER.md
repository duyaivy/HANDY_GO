# HG_44 - UI Customer va Worker

## Muc tieu

Tai lieu mo ta cac man hinh ho so Customer/Worker va luong giao dien xac minh tai khoan tren mobile app HANDY GO. Pham vi hien tai la UI va xu ly camera tren thiet bi; chua bao gom API gui ho so KYC hay cap nhat thong tin tai khoan.

## Ho so Customer va Worker

Hai che do Customer va Worker dung chung `ProfileHeaderCard`, nhung truyen `mode` rieng de hien thi mau avatar fallback, nhan che do app va dieu huong den dung trang chi tiet.

| Khu vuc | Noi dung |
| --- | --- |
| Ho so Customer | Avatar/anh mac dinh, ten, nhan App Khach, thong tin doi che do neu tai khoan co role Worker, trang thai xac minh Worker neu co va dang xuat. |
| Ho so Worker | Avatar/anh mac dinh, ten, nhan App Tho, thong tin doi che do neu tai khoan co role Customer, trang thai KYC va dang xuat. |
| Tai thong tin | `useUserProfile` lay ho so; auth store cung cap phone, email, roles va thao tac dang xuat. Khi tai loi co thong bao va nut thu lai. |
| Dieu huong | Cham card ho so mo trang chi tiet Customer hoac Worker theo mode hien tai. |

Trang ho so chinh an native header "Ho so" phia tren; nhan Ho so tren tab bar van duoc giu.

## Chi tiet ho so

Customer va Worker co route chi tiet rieng, nhung tai du lieu tu cung hook ho so va dung chung `ProfileDetailHeaderCard`.

- Hien avatar, ten, phone, email, trang thai tai khoan va trang thai xac minh Worker.
- Trang thai Worker duoc Viet hoa: Chua xac minh, Cho gui KYC, Dang xet duyet, Da xac minh, Bi tu choi va Tam khoa.
- CTA Xac thuc tai khoan hien khi worker status la `draft` hoac `pending_kyc`.
- Nut sua avatar, phone va email hien thong bao tinh nang chua phat trien; chua co chuc nang luu thay doi.
- Khi tai ho so loi, man hinh hien nut Thu lai.

## Luong xac minh tai khoan

Luong xac minh duoc dung chung cho Customer va Worker, gom cac man doc lap tren Expo Router:

1. **Huong dan** (`/verification/intro`): huong dan chup giay to tuy than va anh khuon mat; anh minh hoa CCCD va chan dung nam/nu duoc dong goi trong `mobile/assets/kyc`. Nut Tiep tuc mo man chup CCCD.
2. **CCCD mat truoc** (`/verification/id-front`): dung camera sau ngay trong app, khung can CCCD ti le 1.586:1, nut chup, xem lai va chup lai. Anh chup duoc crop giua ve cung ti le khung bang `expo-image-manipulator`.
3. **Anh khuon mat** (`/verification/selfie`): dung camera truoc, khung oval, nut chup, xem lai va chup lai. Anh chup hien tai giu nguyen chieu goc tu camera.
4. **Ra soat ho so** (`/verification/submit`): hien anh CCCD mat truoc va anh khuon mat, co nut quay lai va CTA Gui yeu cau.

Native header Expo Router duoc tat cho cac route xac minh; moi man hinh tu hien header/back button rieng. App duoc cau hinh portrait. Quyen camera duoc khai bao bang Expo camera plugin va khong yeu cau microphone.

## Cai dat thu vien camera

Luong chup CCCD su dung cac package Expo sau:

| Package | Muc dich |
| --- | --- |
| `expo-camera` | Mo camera sau cho CCCD va camera truoc cho anh khuon mat. |
| `expo-image-manipulator` | Crop anh CCCD chup duoc theo ti le khung 1.586:1. |
| `expo-image` | Hien thi anh minh hoa va anh preview trong app. |

Neu package chua co trong `mobile/package.json`, chay tu thu muc `mobile`:

```bash
pnpm expo install expo-camera expo-image-manipulator expo-image
```

Expo se chon phien ban tuong thich voi SDK dang dung. `expo-camera` da duoc khai bao trong `plugins` cua `app.config.ts` voi quyen camera; khong yeu cau quyen microphone.

Sau khi cai them native module, can build lai development client (khong chi reload Metro):

```bash
pnpm run android
```

## Gioi han hien tai

- Anh camera chi duoc giu bang URI local trong navigation state; chua upload, luu lau dai hay gui den server.
- Nut Dung anh nay va Gui yeu cau hien thong bao placeholder; chua co API backend xu ly KYC.
- Cap nhat avatar, phone va email chua duoc ket noi API.
- De chay camera tren thiet bi, development client can duoc build voi cac native module Expo Camera va Image Manipulator.

## Vi tri ma nguon

| Khu vuc | Duong dan |
| --- | --- |
| Profile header dung chung | `mobile/src/features/profile/components/profile-header-card.tsx` |
| Profile Customer/Worker | `mobile/src/features/profile/customer/screens/customer-profile-screen.tsx`, `mobile/src/features/profile/worker/screens/worker-profile-screen.tsx` |
| Profile detail Customer/Worker | `mobile/src/features/profile-detail/customer/screens/customer-profile-detail-screen.tsx`, `mobile/src/features/profile-detail/worker/screens/worker-profile-detail-screen.tsx` |
| Card chi tiet dung chung | `mobile/src/features/profile-detail/components/profile-detail-header-card.tsx` |
| Man huong dan va capture | `mobile/src/features/profile-detail/shared/screens/account-verification-intro-screen.tsx`, `mobile/src/features/profile-detail/shared/screens/account-verification-id-front-screen.tsx`, `mobile/src/features/profile-detail/shared/screens/account-verification-selfie-screen.tsx` |
| Man ra soat | `mobile/src/features/profile-detail/shared/screens/account-verification-submit-screen.tsx` |
| Expo routes | `mobile/src/app/verification/` |