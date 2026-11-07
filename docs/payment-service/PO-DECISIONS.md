# Payment Service — quyết định đã chốt và phụ thuộc còn mở

Cập nhật **07/11/2026**. Chính sách gốc: [HandyGo PO Final](../HandyGo_PO_Decisions_Final_VI.md). Trạng thái triển khai: [checklist HG-51](HG-51-PAYMENT-SERVICE-CHECKLIST.md), [README](../../backend/apps/payment-service/README.md), [evidence](evidence/HG-51-test-evidence-2026-11-07.md).

## Đã chốt và đã xử lý phía Payment

- Commission mặc định 10%; Admin cấu hình 0–30% inclusive, cấm 100%. ROUND_HALF_UP bằng bigint; snapshot tại thời điểm tạo Order và không sửa hồi tố. API version tương lai + DB exclusion ngăn overlap.
- Người dùng đã duyệt hướng seed ngày 07/11: bắt buộc `COMMISSION_SEED_EFFECTIVE_FROM` và `COMMISSION_SEED_ACTOR_ID`, không mặc định/startup seed; transaction cùng audit, chạy lại không tạo rule trùng. Actor phải là identity thật được ủy quyền; Payment kiểm tra UUID, người triển khai xác minh identity.
- Cash và Point đều chỉ refund về Point. Có yêu cầu full/partial, Admin khác người yêu cầu/Customer duyệt, audit, cap gồm pending/in-flight/completed dưới khóa Payment. Approval chưa cho phép phát hành Point; giữ `needs_review` đến khi có nguồn/contract.
- Quyền kỹ thuật theo convention dấu `:`: `payment:read:all`, `commission:manage`, `refund:create`, `refund:read:all`, `refund:approve`, `payment:reconcile`, `payment:dlq:replay`. Cần cả JWT role Admin và quyền tương ứng. Không tự cấp permission trong Auth.
- Admin replay dead event giữ ID/payload và audit; báo cáo nội bộ một snapshot/ngày Việt Nam. Không có tự động xóa dữ liệu theo retention đề xuất.
- VNPAY IPN kiểm tra chữ ký/merchant/status/amount; browser return handler đã có ở Payment, chỉ hướng dẫn query trạng thái, không settlement.

## Phụ thuộc cần owner hoàn tất trước khi bật tài chính thật

| Owner | Việc cần chốt/triển khai | Hành vi khi chưa có |
| --- | --- | --- |
| PO/DevOps | Cấp thời điểm rollout có timezone và UUID Admin/actor hệ thống thật cho từng môi trường, ghi bằng chứng cấp quyền. Quyết định riêng cho Order trước rollout. | Không seed staging/prod; Order không có rule hiệu lực retry rồi dead, không backdate. |
| Wallet/Finance | Nguồn Point được bảo đảm cho refund Cash/Point; reversal cân bằng sau khi Worker đã rút; thu hồi nợ/bù quỹ; điều chỉnh commission và phần dư VND. | Refund duyệt giữ `needs_review`, không gọi credit không có nguồn. |
| Wallet | Contract versioned/authenticated cho funded credit/reversal, operation ID ổn định theo refund, lookup kết quả, replay fingerprint, insufficient funding, timeout sau commit. | Không có dispatcher refund/confirm-completed; chưa phát event thành công. |
| Order/Notification | Payload/version event full/partial, consumer không hiểu partial thành hủy Order, cùng test compatibility. | Payment giữ status đã settled khi refund mới chỉ được duyệt; không phát event refund mới. |
| User Trust/Security | Internal bank snapshot API có auth/version, verified/owner/account khớp withdrawal; mã hóa at-rest/quản lý khóa và retention. | Default `BankSnapshotProvider` không trả dữ liệu; payout pending, không claim/dispatch. |
| Auth/Security | Cấp đúng permission dấu `:` cho Admin được ủy quyền, rà soát phân tách người tạo/duyệt. Ngưỡng refund giá trị lớn chưa được đặt tự động. | JWT thiếu quyền bị 403, role Admin đơn thuần không đủ. |
| Gateway/DevOps/VNPAY | Expose IPN public signature-only và return qua Gateway; credentials sandbox; URL IPN merchant chấp thuận, HTTPS tunnel/staging. | Endpoint có trong Payment không chứng minh Gateway hay merchant đã hoạt động. |
| Wallet/Backend | Xác minh envelope root/data, ACK top-up, replay/claim-cancel race qua broker và HTTP thật. | Mock không được coi là bằng chứng liên service. |
| Operations/Finance | Lịch sweep (hiện 15s, 60s là đề xuất), đối soát provider/ledger thực tế, lịch báo cáo và giám sát sai lệch. | Báo cáo mới chỉ đếm unresolved trong DB Payment; `walletLedgerCompared:false`. |
| Legal/Security | Duyệt retention và quyền truy cập audit/event/bank data. 90 ngày/10 năm vẫn chỉ là đề xuất. | Không tự động purge dữ liệu. |

## Ranh giới bàn giao

Đợt này chỉ sửa Payment, script/package entry liên quan và tài liệu. Không sửa Wallet, User Trust, Gateway, không seed/migrate môi trường thật, không tạo commit/PR. HG-51 chưa nghiệm thu toàn bộ khi các integration gate ở trên còn mở. Chính sách cũ “hoàn Cash thủ công”, “commission 100% chờ quyết định”, “chưa có Admin/refund” đã được thay thế bởi nội dung hiện hành này; evidence 05/11 được giữ làm lịch sử.
