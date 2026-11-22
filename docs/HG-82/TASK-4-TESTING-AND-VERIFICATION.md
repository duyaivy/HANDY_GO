# [HG-82] Task 4: Kiểm Thử Toàn Diện, Tích Hợp & Đảm Bảo Chất Lượng

- **Mã công việc:** HG-82-TASK-04
- **Phân hệ:** `order-service`, `payment-service`, `notification-service`, `tracking-service`
- **Mức độ ưu tiên:** High
- **Trạng thái (21/11/2026):** Hoàn thành kiểm tra local và tích hợp trên PostgreSQL/RabbitMQ/Wallet test cô lập; chưa kiểm thử app hoặc môi trường deploy
- **Nhánh phát triển:** `feature/HG-82-order-dispute-7-days-admin-resolution`
- **Tài liệu tham chiếu:** [README.md](./README.md)

---

## 1. Mục Tiêu Nghiệp Vụ
Đảm bảo tính đúng đắn, an toàn dữ liệu và tuân thủ chặt chẽ tiêu chuẩn chất lượng (Quality Gate) của toàn bộ các tính năng được phát triển trong nhánh HG-82 trước khi bàn giao.

---

## 2. Danh Mục Kịch Bản Kiểm Thử (Test Matrix)

### 2.1. Unit Test: Khách hàng khiếu nại trong vòng 7 ngày (`OrdersService.dispute`)
File: `backend/apps/order-service/src/orders/orders.service.spec.ts`

| ID | Kịch bản kiểm thử | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UT-01** | Khiếu nại đơn đang thực hiện | `status: 'in_progress'`, caller: Customer | Thành công chuyển sang `disputed`, `disputePreviousStatus = 'in_progress'` |
| **UT-02** | Khiếu nại đơn chờ xác nhận | `status: 'awaiting_customer_confirmation'`, caller: Worker | Thành công chuyển sang `disputed` |
| **UT-03** | Khiếu nại đơn đã `completed` trong thời hạn $\le 7$ ngày | `status: 'completed'`, `completedAt: now - 3 days`, caller: Customer | Thành công chuyển sang `disputed`, `disputePreviousStatus = 'completed'` |
| **UT-04** | Khiếu nại đơn đã `completed` đúng mốc biên 7 ngày (168 giờ) | `status: 'completed'`, `completedAt: now - 168h`, caller: Customer | Thành công chuyển sang `disputed` |
| **UT-05** | Khiếu nại đơn đã `completed` quá thời hạn $> 7$ ngày (8 ngày) | `status: 'completed'`, `completedAt: now - 8 days`, caller: Customer | Bị từ chối: Ném lỗi `BadRequestException` với mã `COMPLAINT_WINDOW_EXPIRED` |
| **UT-06** | Thợ cố tình khiếu nại đơn đã `completed` | `status: 'completed'`, caller: Worker | Bị từ chối: Ném lỗi `ForbiddenException` |
| **UT-07** | Người không phải khách hàng khiếu nại đơn đã hoàn thành | `status: 'completed'`, caller: Worker hoặc người khác | HTTP 403 `DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION` |
| **UT-08** | Khiếu nại đơn có kèm bằng chứng | `evidenceUrls: ['url1', 'url2']` | Tạo thành công các bản ghi `OrderEvidence` tương ứng |
| **UT-09** | Outbox event được tạo chuẩn xác | Mở khiếu nại thành công | Outbox ghi nhận đúng event `order.disputed` với đầy đủ payload |

---

### 2.2. Unit Test: Admin tra cứu danh sách khiếu nại (`OrdersService.adminFindDisputes`)
File: `backend/apps/order-service/src/orders/orders.service.spec.ts`.

| ID | Kịch bản kiểm thử | Dữ liệu đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UT-10** | Người dùng không phải ADMIN truy cập | `roles: ['customer']` | Ném lỗi `ForbiddenException` với mã `FORBIDDEN_ROLE` |
| **UT-11** | Admin truy vấn danh sách phân trang | `page: 1, limit: 10`, `roles: ['admin']` | Trả về danh sách orders có `status: 'disputed'`, phân trang chính xác |
| **UT-12** | Admin lọc theo từ khóa tìm kiếm (`search`) | `search: 'ORD-2026'` | Lọc đúng theo mã đơn hoặc lý do tranh chấp |
| **UT-13** | Admin lọc theo trạng thái trước khi khiếu nại | `previousStatus: 'completed'` | Chỉ trả về các đơn khiếu nại sau nghiệm thu |
| **UT-13A** | Chưa có phán quyết | Đơn `disputed`, chưa có `OrderDisputeResolution` cho `disputedAt` hiện tại | `resolution: null`, UI hiển thị “Chờ Admin phán quyết” |
| **UT-13B** | Refund đang chờ/cần rà soát | Đơn `disputed`, resolution hiện tại `refund_pending` hoặc `needs_review` | Item vẫn trong queue; trả đúng `resolutionId`, `state`, `refundAmountVnd`, nhãn và total/pagination |
| **UT-13C** | Nhiều chu kỳ khiếu nại | Cùng Order có resolution cũ, `disputedAt` mới chưa có quyết định | Không lấy nhầm resolution của chu kỳ cũ |

---

### 2.3. Unit Test: Admin phán quyết khiếu nại (`OrdersService.resolveDispute`)
Files: `backend/apps/order-service/src/orders/orders.service.spec.ts`, `backend/apps/order-service/src/orders/hg82-resolution.spec.ts`, `backend/apps/order-service/src/consumers/hg82-payment-events.spec.ts`, `backend/apps/payment-service/src/order-events/dispute-refund.service.spec.ts`, `backend/apps/payment-service/src/refunds/hg82-refund-outcome.spec.ts` và `backend/apps/order-service/src/orders/admin-orders.controller.spec.ts`.

Các kỳ vọng về mã HTTP cần kiểm tra thêm ở controller/e2e; unit test service xác nhận lỗi nghiệp vụ, trạng thái DB và outbox.

| ID | Kịch bản kiểm thử | Phán quyết (`action`) | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **UT-14** | Admin chọn Bác bỏ khiếu nại (`dismiss`) | `action: 'dismiss'`, `idempotencyKey` | HTTP 200; `disputed → completed`, giữ `completedAt`/Payment; có `order.dispute.resolved`, không có `order.completed` mới |
| **UT-15** | Admin chọn Yêu cầu làm lại (`rework`) | `action: 'rework'`, `idempotencyKey` | HTTP 200; `disputed → in_progress`, giữ `firstCompletedAt`, snapshot rồi reset `workerFinishedAt`/`completedAt`; hoàn thành bảo hành không phát `order.completed` lần hai |
| **UT-16** | Admin chọn Hoàn tiền (`refund`) | `refundAmountVnd: '200000'`, `idempotencyKey` | HTTP 202 Accepted; resolution `refund_pending`, Order vẫn `disputed`; chỉ phát `order.dispute.decision.recorded`, chưa phát `order.dispute.resolved` |
| **UT-17** | Số tiền vượt hạn mức còn hoàn | `refundAmountVnd` > refundableAmount Payment trả về | HTTP 400 `REFUND_AMOUNT_EXCEEDS_REFUNDABLE`; không ghi quyết định |
| **UT-18** | Người không phải Admin cố tình resolve | `roles: ['worker']` | Bị từ chối: Ném lỗi `ForbiddenException` |
| **UT-19** | Resolve đơn không ở trạng thái `disputed` | Đơn đang ở `in_progress` | Bị từ chối: Ném lỗi `ConflictException` (`INVALID_STATE_TRANSITION`) |
| **UT-20** | Gọi lặp cùng `idempotencyKey` và payload | Gọi lại sau khi trạng thái Order đã đổi | Trả hồ sơ/kết quả cũ, không tạo quyết định/event/refund thứ hai |
| **UT-21** | Cùng key nhưng payload khác | Đổi action/số tiền/note | HTTP 409 `DISPUTE_ALREADY_DECIDED` |
| **UT-22** | Hai key cho cùng một lần khiếu nại | Hai request đồng thời | Chỉ một quyết định thắng nhờ unique `(orderId, disputedAt)` và status/version CAS; request còn lại HTTP 409 |
| **UT-23** | Action ORD-08 cũ trên khiếu nại sau hoàn thành | `complete`, `cancel` hoặc `resume_previous_state` | HTTP 400 `LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`; không đổi Order/Payment |
| **UT-24** | Payment không đủ điều kiện hoàn | Payment `pending`, `processing`, `failed`, `cancelled` hoặc không tồn tại | HTTP 409 `PAYMENT_NOT_REFUNDABLE`; không ghi quyết định |
| **UT-25** | Action HG-82 mới trên tranh chấp trước hoàn thành | `dismiss`, `rework` hoặc `refund` | Bị từ chối; hành vi ORD-08 cũ vẫn chạy đúng |
| **UT-26** | Payment xác nhận refund một phần/toàn phần | Kết quả có đúng `resolutionId`, `paymentStatus` | Order `disputed → completed`, `paymentState = partially_refunded/refunded`, có `order.dispute.resolved` đúng một lần |
| **UT-27** | Wallet timeout trong lúc còn đối soát | Payment refund tạm `needs_review`, chưa xác định cần xử lý thủ công | Order vẫn `disputed`, resolution `refund_pending`; không hiển thị “đã hoàn tiền” và không tạo refund ID mới |
| **UT-28** | Payment xác định cần can thiệp | Event kết quả có `resolutionId` và mã lỗi an toàn | Order vẫn `disputed`, resolution `needs_review`; Task 2 hiện nhãn can thiệp thủ công |
| **UT-29** | Tách actor yêu cầu/phê duyệt refund | `requestedByUserId = null` hoặc UUID hệ thống; `approvedByUserId = adminUserId` khác khách | Không gặp `FORBIDDEN` do tự duyệt; audit đúng actor; Admin trùng khách Payment vẫn bị guard chặn |
| **UT-30** | Backfill mốc hoàn thành đầu | Order cũ có/không có `completedAt`, chạy migration hai lần trong test DB | Chỉ điền `firstCompletedAt` khi đang null và có `completedAt`; không ghi đè, không dùng `now()`; rà soát trường hợp lịch sử làm lại |

### 2.4. Integration Test liên dịch vụ cho Task 3

Chạy bằng môi trường test local và dữ liệu thanh toán test: Order outbox → Payment inbox → RefundsService/Wallet test → Payment outcome → Order inbox. `cross-service-transport.int-spec.ts` kiểm tra đường event qua RabbitMQ và Order chỉ kết thúc sau Payment/Wallet xác nhận. `funded-wallet-refunds.int-spec.ts` kiểm tra inbox idempotency, refund thật vào Wallet, hai Admin request đồng thời, unique `(orderId, disputedAt)` và Order consumer bỏ event trùng. `payment-query.int-spec.ts` kiểm tra HTTP query sau khi nạp `ConfigModule` cho controller nội bộ. Các unit test khác kiểm tra event sai thứ tự/sai Payment, `needs_review`, thiếu Payment, hạn mức và notification chống báo thành công hai lần. Timeline trên app và notification/tracking qua broker ở môi trường deploy chưa được xác minh.

---

## 3. Quy Trình Kiểm Thử & Tiêu Chuẩn Nghiệm Thu (Quality Gate)

### 3.1. Các Lệnh Thực Hiện Kiểm Tra (CLI Commands)
Thực thi các lệnh sau tại thư mục gốc backend:
```powershell
# 1. Typecheck và build bốn service liên quan (repo có một package.json tại backend/)
pnpm run typecheck
pnpm exec nest build order-service
pnpm exec nest build payment-service
pnpm exec nest build notification-service
pnpm exec nest build tracking-service

# 2. Chạy toàn bộ unit/regression suite, bao gồm các suite HG-82
pnpm test
pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts
pnpm exec vitest run apps/order-service/src/orders/hg82-resolution.spec.ts
pnpm exec vitest run apps/order-service/src/orders/admin-orders.controller.spec.ts
pnpm exec vitest run apps/order-service/src/consumers/hg82-payment-events.spec.ts
pnpm exec vitest run apps/payment-service/src/refunds apps/payment-service/src/order-events

# 3. Test tích hợp trên container PostgreSQL/RabbitMQ tạm, Wallet HTTP thật
pnpm run prisma:generate:wallet
& .\scripts\payment-test-up.ps1
. .\scripts\payment-test-env.ps1
$env:PAYMENT_TEST_RABBITMQ_URL = $env:RABBITMQ_URL
pnpm run test:integration:payment
& .\scripts\payment-test-down.ps1

# 4. Lint các service liên quan và xác thực schema
pnpm exec oxlint apps/order-service/src apps/payment-service/src apps/notification-service/src/events apps/tracking-service/src/events libs/common/src/events
pnpm exec prisma validate --schema=apps/order-service/prisma/schema.prisma --config=apps/order-service/prisma/prisma.config.ts
pnpm exec prisma validate --schema=apps/payment-service/prisma/schema.prisma
```

### 3.2. Kết quả kiểm tra local ngày 21/11/2026

| Kiểm tra | Kết quả | Giới hạn |
| :--- | :--- | :--- |
| `pnpm test` | **PASS:** 245 file, 2.098 test; 18 file và 167 test được suite đánh dấu skip | Các mock không xác nhận dòng tiền thực |
| `pnpm run typecheck` | **PASS** | Wallet Prisma client được generate lại từ schema hiện tại trước integration |
| Nest build Order, Payment, Notification, Tracking | **PASS** cả bốn | Chỉ xác nhận biên dịch |
| `oxlint` trên các module liên quan | **PASS** | Không thay thế kiểm thử chạy thật |
| `prisma validate` Order và Payment | **PASS** | Kiểm tra cấu trúc schema; migration trên DB test ghi ở dòng dưới |
| Migration Order/Payment/Wallet trên PostgreSQL test | **PASS** | Database test trống: áp dụng 19 migration lịch sử (7 Order, 6 Payment, 6 Wallet), trong đó chỉ 4 file SQL mới thuộc HG-82 (3 Order, 1 Payment); không đụng DB deploy |
| `pnpm run test:integration:payment` | **PASS:** 9 file, 76 test | Test HG-82 mới đi qua RabbitMQ và Wallet thật; không phải kiểm thử app/deploy |

Các test mới của Task 4 kiểm tra projection `refund_pending`/`needs_review` đúng chu kỳ khiếu nại, số tiền hoàn mặc định và vượt hạn mức, hai idempotency key cho cùng chu kỳ, từ chối action cũ và role sai, Payment replay/Payment đổi trạng thái, kết quả hoàn một phần/toàn phần và event sai payment/refund ID. Test tích hợp xác nhận unique/CAS khi hai yêu cầu Admin chạy đồng thời, backfill SQL chạy lặp không ghi đè mốc cũ, và Order chỉ kết thúc sau khi Wallet ghi sổ. Test biên 168 giờ, HTTP 202, Wallet chưa xác nhận và actor tách biệt đã có trong các suite của Task 1–3 và đều pass trong lần chạy này.

**Giới hạn:** Chưa chạy các ca HG-82 về notification/tracking qua broker và timeline trên app/deploy. Backfill được kiểm tra với SQL cùng điều kiện migration trên PostgreSQL test sau khi migration đã áp dụng, không phải phục dựng dữ liệu lịch sử thật. Không dùng kết quả test local để khẳng định tiền đã hoàn trên môi trường deploy.

Trên database cũ, `prisma migrate deploy` chỉ áp dụng các migration chưa có trong `_prisma_migrations` của schema tương ứng. Nếu các migration trước HG-82 đã được ghi nhận đầy đủ thì tối đa 4 file HG-82 còn chờ; nếu Task 1/2 đã chạy thì ít hơn. Không suy số migration còn chờ từ kết quả dựng database test trống; kiểm tra lịch sử trên đúng database đích trước khi triển khai.

### 3.3. Tiêu Chí Nghiệm Thu (Acceptance Criteria / DoD)

- [x] Các ca unit và tích hợp local nêu ở trên chạy PASS; hai yêu cầu Admin đồng thời, backfill và chuỗi Order–Payment–Wallet–Order đã được kiểm tra trên DB/broker test.
- [x] Không có lỗi biên dịch TypeScript (`tsc --noEmit`).
- [x] Task 2 trả projection phán quyết hiện tại; Task 3 có test tích hợp Order–Payment–Wallet test, cùng test HTTP 202, idempotency, mã lỗi và trạng thái chờ.
- [x] Không đánh dấu refund đã xác nhận trên app/deploy từ kết quả test local; migration chỉ chạy trên DB test tạm, không thay đổi môi trường deploy.
- [ ] Xác minh notification/tracking HG-82 qua broker và timeline trên app/deploy khi có môi trường nghiệm thu tương ứng.
- [x] Tuân thủ [AGENTS.md](../../AGENTS.md): chỉ sửa/commit local trên nhánh HG-82, không push hay tạo PR.
