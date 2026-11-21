# [HG-74] Tài Liệu Đặc Tả & Thiết Kế API Backend Admin Dashboard

> **Mã công việc:** HG-74 (Backend API cho HG-75 Web Admin Dashboard)  
> **Người thực hiện:** Huỳnh Đức Thịnh  
> **Người yêu cầu:** Trần Tâm Như  
> **Ngày cập nhật:** 14/11/2026  
> **Trạng thái:** Đã rà soát & Điều chỉnh hoàn thiện  
> **Tài liệu gốc:** [API-BE-DASHBOARD.pdf](file:///D:/SCHOOL/PBL6/docs/HG-74-API-BE-DASHBOARD/API-BE-DASHBOARD.pdf)

---

## 1. Mục Tiêu & Bối Cảnh
Xây dựng hệ thống RESTful API cung cấp dữ liệu thống kê tổng quan và số liệu phân tích về hoạt động của toàn bộ nền tảng HandyGo, phục vụ giao diện **Admin Web Dashboard (HG-75)**.

### Các khối thống kê trên Dashboard:
| STT | Nhóm thống kê | Nội dung chi tiết |
| :--- | :--- | :--- |
| **1** | **Thống kê tổng quan** | Doanh thu (GMV & Doanh thu sàn), Tổng đơn hàng, Thợ hoạt động, Khách hàng |
| **2** | **Xu hướng đơn hàng** | Biểu đồ biến động số lượng đơn hàng theo thời gian (giờ/ngày/tuần/tháng) |
| **3** | **Trạng thái đơn hàng** | Cơ cấu đơn theo trạng thái (Hoàn thành, Đang xử lý, Đã hủy, **Khiếu nại/Tranh chấp**) |
| **4** | **Hiệu suất đơn hàng** | Tỷ lệ hoàn thành và tỷ lệ hủy đơn |
| **5** | **Top thợ hoạt động tốt** | Danh sách 5 thợ có số đơn hoàn thành cao nhất và đánh giá tốt nhất |
| **6** | **Top dịch vụ phổ biến** | Danh sách 5 dịch vụ có số đơn hoàn thành nhiều nhất |

---

## 2. Quy Định Về Khoảng Thời Gian & Múi Giờ

### 2.1. Các khoảng thời gian hỗ trợ
Tất cả các API thống kê đều nhận chung bộ lọc thời gian:

| Khoảng thời gian | Phạm vi thống kê | Độ chi tiết xu hướng (Granularity) |
| :--- | :--- | :--- |
| **Hôm nay (`today`)** | Từ `00:00:00` đến thời điểm hiện tại của ngày hôm nay | **Theo giờ (`hour`)** (24 mốc 0h–23h) |
| **7 ngày (`7days`)** | 7 ngày gần nhất, bao gồm cả hôm nay | **Theo ngày (`day`)** (7 mốc ngày) |
| **30 ngày (`30days`)** *(mặc định)* | 30 ngày gần nhất, bao gồm cả hôm nay | **Theo ngày (`day`)** (30 mốc ngày) |
| **Tùy chỉnh (`custom`)** | Từ `startDate` đến `endDate` do Admin chỉ định | Tự động tính theo bảng quy tắc bên dưới |

### 2.2. Quy tắc tự động chọn độ chi tiết cho khoảng thời gian tùy chỉnh:
| Độ dài khoảng thời gian | Độ chi tiết thống kê (`granularity`) | Ghi chú |
| :--- | :--- | :--- |
| **1 ngày** | **Theo giờ (`hour`)** | Gom theo từng giờ (00:00 -> 23:00) |
| **2 – 31 ngày** | **Theo ngày (`day`)** | Gom theo ngày (`YYYY-MM-DD`) |
| **32 – 90 ngày** | **Theo tuần (`week`)** | Gom theo đầu tuần (Thứ 2 hàng tuần) |
| **Trên 90 ngày (tối đa 365 ngày)** | **Theo tháng (`month`)** | Gom theo tháng (`YYYY-MM`) |

> [!IMPORTANT]
> **Ràng buộc an toàn (Guardrails):**
> 1. **Giới hạn tối đa:** Khoảng thời gian tùy chỉnh không được vượt quá **365 ngày (1 năm)** để tránh quét toàn bộ database gây nghẽn RAM/CPU.
> 2. **Múi giờ bắt buộc:** Toàn bộ việc gom nhóm mốc thời gian (`date_trunc`) phải thực thi theo múi giờ Việt Nam **`Asia/Ho_Chi_Minh` (UTC+7)**, tránh tình trạng đơn tạo từ 00:00 đến 07:00 sáng bị gom nhầm vào ngày hôm trước do lưu UTC.
> 3. **Điền khuyết (Zero-filling):** Backend tự động điền các mốc thời gian không phát sinh đơn hàng với giá trị `0` để biểu đồ frontend hiển thị liên tục, không bị đứt gãy.

---

## 3. Nội Dung Thống Kê & Điều Chỉnh Logic Nghiệp Vụ

### 3.1. Thống kê tổng quan (4 Metric Cards)
- **Doanh thu (VND):**
  - *Quy tắc tính (Chưa tính hoa hồng sàn):* Hiện tại hệ thống chưa áp dụng thu phí hoa hồng/chiết khấu nền tảng. Doanh thu hiển thị trên Dashboard là **Tổng giá trị của các đơn hàng đã hoàn thành** trong khoảng thời gian được chọn:
    $$\text{Doanh thu} = \sum \text{Order.agreedPrice} \quad (\text{với } \text{status} = \text{'completed'})$$
  - *Mốc thời gian:* Dựa trên thời điểm đơn hàng hoàn thành (`Order.completedAt BETWEEN startDate AND endDate`).
  - *Giá trị trả về:* Trả về trực tiếp tổng số tiền (`total`: ví dụ `125400000` VND tương ứng `125,4 triệu đ` trên mockup).
- **Tổng đơn hàng:** Tổng số đơn hàng được tạo (`Order.createdAt`) trong khoảng thời gian lọc (tính tất cả các trạng thái).
- **Thợ hoạt động:**
  - *Điều chỉnh chuẩn hóa:* Trả về 2 con số:
    - `activeInPeriod`: Số thợ duy nhất có phát sinh giao dịch/báo giá/nhận việc trong kỳ.
    - `totalVerified`: Tổng số thợ đã duyệt (`WorkerStatus.verified`) trên toàn hệ thống tính đến hiện tại.
- **Khách hàng:**
  - *Điều chỉnh chuẩn hóa:* Trả về 2 con số:
    - `totalCumulative`: Tổng số khách hàng tích lũy toàn hệ thống tính đến cuối kỳ (phù hợp con số **2.450** trên mockup).
    - `newInPeriod`: Số khách hàng đăng ký tài khoản mới trong khoảng thời gian lọc.

---

### 3.2. Thống kê xu hướng đơn hàng (Order Trend Chart)
- Cung cấp chuỗi dữ liệu biến động số lượng đơn hàng được tạo theo từng mốc thời gian (giờ/ngày/tuần/tháng).
- Dựa trên thời gian tạo đơn (`Order.createdAt`).
- Sắp xếp tăng dần theo thời gian (`ASC`).
- Đảm bảo đầy đủ các mốc thời gian (các mốc không có đơn hàng có `orderCount = 0`).

---

### 3.3. Thống kê trạng thái & Hiệu suất đơn hàng
- **Phân nhóm trạng thái:**
  - **Hoàn thành (`completed`):** Trạng thái `completed`.
  - **Đang xử lý (`processing`):** Gồm `created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation`.
  - **Đã hủy (`cancelled`):** Trạng thái `cancelled`.
  - **Khiếu nại / Tranh chấp (`disputed`) *(Điều chỉnh bổ sung)*:** Trạng thái `disputed`. Phân nhóm này cần hiển thị nổi bật trên Dashboard để Admin kịp thời phát hiện và giải quyết tranh chấp.
- **Công thức hiệu suất:**
  - **Tỷ lệ hoàn thành:** `(Số đơn hoàn thành / Tổng đơn hàng) * 100%`
  - **Tỷ lệ hủy đơn:** `(Số đơn đã hủy / Tổng đơn hàng) * 100%`
  - *Lưu ý:* Làm tròn đến 1 chữ số thập phân (vd: `69.5%`, `11.2%`). Khi tổng đơn hàng bằng 0, tỷ lệ trả về `0.0%`.

---

### 3.4. Top 5 thợ hoạt động tốt nhất
- **Tiêu chuẩn tính:**
  - Lọc các đơn hàng có ngày hoàn thành nằm trong khoảng thời gian: `Order.completedAt BETWEEN startDate AND endDate`.
  - Đếm tổng số đơn hoàn thành theo từng thợ (`workerUserId`).
- **Tiêu chí xếp hạng:**
  - Ưu tiên thợ có số đơn hoàn thành nhiều nhất.
  - Nếu bằng nhau, ưu tiên thợ có điểm đánh giá trung bình (`averageRating`) cao hơn.
  - Sắp xếp giảm dần, giới hạn 5 thợ (`LIMIT 5`).
- **Dữ liệu trả về:** `workerUserId`, Họ tên (`fullName`), Ảnh đại diện (`avatarUrl`), Số đơn hoàn thành (`completedOrderCount`), Điểm đánh giá (`averageRating`).

---

### 3.5. Top 5 dịch vụ phổ biến nhất
- **Tiêu chuẩn tính:**
  - Lọc các đơn hàng hoàn thành trong khoảng thời gian: `Order.completedAt BETWEEN startDate AND endDate`.
  - Đếm số đơn hoàn thành theo từng mã dịch vụ (`serviceId`).
- **Tiêu chí xếp hạng:**
  - Sắp xếp theo số đơn hoàn thành có sử dụng dịch vụ từ cao xuống thấp.
  - Giới hạn 5 dịch vụ (`LIMIT 5`).
- **Dữ liệu trả về:** `serviceId`, Tên dịch vụ (`name`), Icon đại diện (`iconUrl`), Số đơn hoàn thành (`completedOrderCount`).

---

## 4. Thiết Kế Chi Tiết Danh Sách API (RESTful Endpoints)

Nhằm tối ưu cho kiến trúc Microservices và giúp Frontend tải bất đồng bộ (tránh để trang web bị đơ nếu gom chung vào 1 API), hệ thống cung cấp **5 API chuyên biệt** theo từng widget:

### 4.1. Common Query Parameters
```typescript
interface DashboardQueryDto {
  period?: 'today' | '7days' | '30days' | 'custom'; // Default: '30days'
  startDate?: string; // Format: 'YYYY-MM-DD' (Required if period = 'custom')
  endDate?: string;   // Format: 'YYYY-MM-DD' (Required if period = 'custom')
  timeZone?: string;  // Default: 'Asia/Ho_Chi_Minh'
}
```

---

### 4.2. API 1: Thống Kê Tổng Quan (Overview Cards)
- **Endpoint:** `GET /api/v1/admin/dashboard/overview`
- **Quyền:** `ADMIN`
- **Ví dụ Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "revenue": {
      "total": 125400000,
      "currency": "VND"
    },
    "orders": {
      "total": 1284
    },
    "workers": {
      "activeInPeriod": 328,
      "totalVerified": 512
    },
    "customers": {
      "totalCumulative": 2450,
      "newInPeriod": 185
    }
  }
}
```

---

### 4.3. API 2: Xu Hướng Đơn Hàng (Order Trend Chart)
- **Endpoint:** `GET /api/v1/admin/dashboard/order-trend`
- **Query bổ sung:** `granularity?: 'hour' | 'day' | 'week' | 'month'` (Tùy chọn ghi đè)
- **Ví dụ Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "granularity": "day",
    "timeline": [
      { "bucket": "2026-10-06", "orderCount": 45 },
      { "bucket": "2026-10-07", "orderCount": 52 },
      { "bucket": "2026-10-08", "orderCount": 60 },
      { "bucket": "2026-11-05", "orderCount": 72 }
    ]
  }
}
```

---

### 4.4. API 3: Cơ Cấu Trạng Thái & Tỷ Lệ Đơn Hàng (Status & Performance)
- **Endpoint:** `GET /api/v1/admin/dashboard/order-status`
- **Ví dụ Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "totalOrders": 1284,
    "groups": {
      "completed": { "count": 892, "percentage": 69.5 },
      "processing": { "count": 248, "percentage": 19.3 },
      "cancelled": { "count": 144, "percentage": 11.2 },
      "disputed": { "count": 0, "percentage": 0.0 }
    },
    "details": {
      "created": 40,
      "confirmed": 58,
      "in_progress": 120,
      "awaiting_customer_confirmation": 30,
      "completed": 892,
      "cancelled": 144,
      "disputed": 0
    },
    "performance": {
      "completionRate": 69.5,
      "cancellationRate": 11.2
    }
  }
}
```

---

### 4.5. API 4: Top 5 Thợ Xuất Sắc (Top Workers)
- **Endpoint:** `GET /api/v1/admin/dashboard/top-workers`
- **Query bổ sung:** `limit?: number` (Default: 5)
- **Ví dụ Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "workerUserId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "fullName": "Nguyễn Văn An",
      "avatarUrl": "https://storage.handygo.vn/avatars/an.jpg",
      "completedOrderCount": 58,
      "averageRating": 4.9
    },
    {
      "workerUserId": "e7b1a2c3-8899-4d5e-a1b2-c3d4e5f60718",
      "fullName": "Trần Văn Bình",
      "avatarUrl": "https://storage.handygo.vn/avatars/binh.jpg",
      "completedOrderCount": 45,
      "averageRating": 4.8
    },
    {
      "workerUserId": "f8c2b3d4-99aa-5e6f-b2c3-d4e5f6a70819",
      "fullName": "Lê Minh Cường",
      "avatarUrl": "https://storage.handygo.vn/avatars/cuong.jpg",
      "completedOrderCount": 39,
      "averageRating": 4.8
    }
  ]
}
```

---

### 4.6. API 5: Top 5 Dịch Vụ Phổ Biến (Top Services)
- **Endpoint:** `GET /api/v1/admin/dashboard/top-services`
- **Query bổ sung:** `limit?: number` (Default: 5)
- **Ví dụ Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "serviceId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Sửa điện",
      "iconUrl": "https://storage.handygo.vn/icons/electricity.png",
      "completedOrderCount": 356
    },
    {
      "serviceId": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
      "name": "Vệ sinh nhà cửa",
      "iconUrl": "https://storage.handygo.vn/icons/cleaning.png",
      "completedOrderCount": 298
    },
    {
      "serviceId": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
      "name": "Vệ sinh máy lạnh",
      "iconUrl": "https://storage.handygo.vn/icons/ac.png",
      "completedOrderCount": 189
    },
    {
      "serviceId": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
      "name": "Sửa chữa nước",
      "iconUrl": "https://storage.handygo.vn/icons/plumbing.png",
      "completedOrderCount": 132
    },
    {
      "serviceId": "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b",
      "name": "Chuyển nhà",
      "iconUrl": "https://storage.handygo.vn/icons/moving.png",
      "completedOrderCount": 98
    }
  ]
}
```

---

## 5. Tối Ưu Chỉ Mục Cơ Sở Dữ Liệu (PostgreSQL Indexes)

Để các truy vấn thống kê đạt phản hồi dưới **100ms** khi khối lượng đơn hàng tăng cao, cần bổ sung các Composite Index sau:

```sql
-- 1. Tối ưu thống kê đơn hàng và biểu đồ xu hướng theo ngày tạo
CREATE INDEX IF NOT EXISTS idx_orders_created_at_status 
ON order_service.orders (created_at, status);

-- 2. Tối ưu Top thợ và Top dịch vụ theo ngày hoàn thành
CREATE INDEX IF NOT EXISTS idx_orders_completed_worker 
ON order_service.orders (completed_at, worker_user_id) 
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_orders_completed_service 
ON order_service.orders (completed_at, service_id) 
WHERE status = 'completed';

-- 3. Tối ưu thống kê doanh thu theo ngày hoàn thành đơn hàng
CREATE INDEX IF NOT EXISTS idx_orders_completed_revenue 
ON order_service.orders (completed_at, agreed_price) 
WHERE status = 'completed';
```

---

## 6. Tiêu Chí Hoàn Thành (Definition of Done)
- [x] Hỗ trợ đầy đủ 4 bộ lọc thời gian: `Hôm nay`, `7 ngày`, `30 ngày` và `Tùy chỉnh` (kèm validation max 365 ngày).
- [x] Cung cấp chính xác chỉ số Doanh thu (Tổng giá trị đơn hoàn thành), Tổng đơn hàng, Thợ hoạt động, Khách hàng.
- [x] Chuỗi dữ liệu xu hướng được fill zero đầy đủ các mốc, tính theo timezone `Asia/Ho_Chi_Minh`.
- [x] Thống kê trạng thái đơn hàng đầy đủ 4 nhóm, bao gồm nhóm đơn tranh chấp/khiếu nại (`disputed`).
- [x] Top 5 thợ và Top 5 dịch vụ tính theo ngày hoàn thành dịch vụ (`completedAt`).
- [x] Bảo mật API: Bắt buộc xác thực qua Gateway và kiểm tra quyền `ADMIN` (`AdminGuard`).
- [x] 100% Typecheck và Unit test các API Dashboard pass.
