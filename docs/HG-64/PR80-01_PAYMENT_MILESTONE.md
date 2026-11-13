# PR80-01 — Không đánh dấu đã thanh toán chỉ vì Order hoàn tất (P1)

## Lỗi và tác động

`mobile/src/features/tracking/types/tracking.types.ts`, hàm tạo milestones, đặt `isPaymentCompleted = payment?.status === 'succeeded' || phase === 'COMPLETED'`. `COMPLETED` trong `backend/apps/tracking-service/src/summary/summary.service.ts` cũng được trả về khi Order ở `completed` mà chưa có payment thành công. Khách và thợ có thể thấy “Đã thanh toán và hoàn tất dịch vụ” khi tiền chưa được xác nhận.

## Hướng sửa đã chọn

1. Trong `buildMilestones` của `tracking.types.ts`, chỉ coi payment thành công khi `payment?.status` thuộc `succeeded`, `completed`, `paid`, đúng các trạng thái đã được backend hỗ trợ. Bỏ điều kiện `phase === 'COMPLETED'` khỏi `isPaymentCompleted`.
2. Đặt `isPaymentPending` khi Order `completed` hoặc `awaiting_customer_confirmation` mà payment chưa thành công. Với Order `completed`, mô tả mốc là “Đơn đã nghiệm thu, đang chờ xác nhận thanh toán”; với `awaiting_customer_confirmation`, giữ mô tả chờ nghiệm thu. Mốc payment vẫn `in_progress`, `reachedAt` chỉ lấy từ payment event khi payment thành công.
3. Giữ `currentPhase === 'COMPLETED'` của backend mang nghĩa **Order hoàn tất** để không đổi contract hiện tại. Màn hình không được suy ra trạng thái tiền từ phase này. Rà các nhãn “đã thanh toán” ở màn hình chi tiết khách/thợ; thay nhãn chỉ dựa vào Order bằng “đã nghiệm thu”.

## Kiểm thử và tiêu chí đạt

- Bổ sung test cho `buildMilestones` trong `mobile/src/features/tracking/__tests__/tracking.test.ts`: Order `completed`, payment `pending` → mốc thanh toán chưa `completed` và không có chữ “Đã thanh toán”.
- Tương tự với `payment` vắng mặt; với payment `succeeded`, mốc chuyển `completed` và lấy đúng `lastEventAt`.
- Chạy `pnpm run type-check` và các suite tracking/customer/worker. Trên hai thiết bị, nghiệm thu Order trước khi event payment tới phải hiển thị trạng thái chờ; sau event payment thành công mới hiển thị đã thanh toán.
