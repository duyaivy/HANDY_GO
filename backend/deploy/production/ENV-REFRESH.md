# Refresh ENV và recovery từ GitHub Actions

Workflow: `.github/workflows/backend-env-refresh.yml`.

## Chạy refresh

1. Merge workflow vào nhánh mặc định để Actions hiển thị nút Run workflow; đưa cùng
   bản script/workflow sang `release` theo quy trình promotion của repository.
2. Cập nhật GitHub Environment `production` → secret `BACKEND_PRODUCTION_ENV`.
   Đây là **toàn bộ** ENV ứng dụng dạng `KEY=value`, không quote; không phải patch
   một vài dòng. Validator từ chối thiếu key bắt buộc, key trùng và placeholder.
3. Actions → **Backend production - refresh ENV only** → Run workflow → branch
   `release` → `mode=refresh` → `confirm=REFRESH_ALL`.
4. Đọc summary và artifact; chỉ `STABLE` mới là release thành công.

Không build hoặc pull image mới và không chạy migration. Bundle mới giữ exact
image digests, Compose, Nginx, service registry và migration hash của stable đang
chạy; cập nhật executor/probe và thêm snapshot ENV mode 600. Stable trên ba VPS
phải đồng nhất. Có downtime khi tạo lại từng container.

Trước khi restart, mỗi VPS kiểm tra candidate ENV bằng runtime image đã cache:
`SELECT 1` với DB chung/override của host, Redis `PING`, RabbitMQ connect/close;
VPS1 còn kiểm tra cặp RSA JWT và SMTP authentication bằng `verify()` (không gửi
email). Container probe bị giới hạn RAM/CPU process count và timeout; preflight
memory budget cộng thêm 128 MiB vào host reserve hiện tại. Probe thất bại thì
không apply host nào. Post-deploy vẫn chạy health/image/restart count và các
business/network probes mà stable bundle đã hỗ trợ.

Preflight không chứng minh mọi biến ENV hợp lệ về nghiệp vụ. Cloudinary, FCM,
payment provider, quyền trên từng bảng hoặc một lỗi chỉ phát sinh khi xử lý request
thực tế cần probe riêng khi mở rộng scope. Secret rotation cũng cần overlap giữa
credential cũ/mới ở nhà cung cấp để snapshot cũ còn sử dụng được khi rollback.

## Khi lỗi, timeout hoặc runner bị mất

Forward rollout có budget 30 phút, kiểm tra giữa các SSH command; không cắt ngang
remote command đang mutate. Job 180 phút để dành thời gian rollback. Lỗi trong
coordinator tắt forward deadline rồi restore snapshot trước đó, verify toàn cụm
và public HTTPS trước khi unlock.

Job `recover` dùng runner/budget riêng và đọc `pending.json`/`stable.json` trên
VPS, nên không phụ thuộc artifact có kịp upload hay không. Job chạy với điều kiện
`always()` sau refresh lỗi/hủy. Host mutation chờ flock tối đa 15 phút để tránh
chạy chồng remote operation còn sống sau khi SSH bị cắt. `owner()` tiếp tục kiểm
tra transaction và target **sau** khi lấy flock.

| Trạng thái thực tế | Hành động |
| --- | --- |
| Không còn pending | Không thao tác; ghi `RECOVERY_NOT_NEEDED`. |
| Cả ba stable đều là target, pending còn VERIFIED/COMMITTED | Verify toàn cụm, hoàn tất commit bị ngắt, rồi finish đúng owner. |
| Rollout/commit mới hoàn tất một phần | Restore snapshot previous ở các host sở hữu transaction, verify mọi host và public HTTPS, rồi finish. |
| Pending thuộc run/attempt khác | Dừng và giữ nguyên để reconcile đúng transaction cũ. |
| VPS không truy cập được, manifest mâu thuẫn, restore/probe lỗi | `FAILED_NEEDS_INTERVENTION`, giữ pending và cho phép retry. |

## Chạy lại recovery bằng nút bấm

Nếu recovery lỗi do mạng hoặc workflow bị force-cancel, chạy **workflow mới**:

- Branch `release`, `mode=recover`, `confirm=RECOVER_ENV`.
- `recovery_run_id`: Run ID của **refresh gốc**, xem URL Actions hoặc artifact.
- `recovery_attempt`: attempt gốc, thường là `1`; không dùng attempt của lần retry.

Ví dụ pending `prod-20261030-123456-a2` tương ứng Run ID `123456`, attempt `2`.
Coordinator chỉ xử lý ENV-only manifest khớp đúng hai giá trị này, kể cả qua nửa
đêm. Retry sau restore/unlock một phần là an toàn; host đã unlock vẫn được verify.

Environment `production` vẫn áp dụng secrets và protection rules của repository;
nếu environment yêu cầu reviewer thì recovery cũng cần deployment approval đó.
Workflow/runner/GitHub mất khả dụng hoàn toàn hoặc force-cancel toàn bộ run vẫn có
thể làm auto recovery không chạy. Dùng mode recovery khi hạ tầng trở lại. Thay đổi
này không tự xử lý pending cũ của **Backend production** (image/migration rollout).

## Thiết kế đề xuất cho production transaction bị kẹt

`pending.json` là journal của một transaction chưa xác minh xong. `flock` hiện
tại chỉ giữ trong một host command. Runner chết hoặc cleanup lỗi có thể để lại
journal sau khi process lock đã được thả. Lần deploy sau `begin()` chặn journal
cũ; coordinator đưa host vào participant trước `begin()` để phòng SSH không rõ
kết quả, rồi `restore()` bằng transaction mới bị `owner()` từ chối. Vì vậy có thể
thấy báo không rollback được dù lần deploy mới chưa thay container nào.

Giải pháp cho production nên dùng **reconciliation trước deploy** và một đường
recovery riêng, thay vì xóa JSON dựa trên tuổi file:

1. Workflow production đọc journal của cả ba host **trước khi tạo transaction
   mới**. Nếu có pending, chuyển sang recovery của owner cũ; chưa cho rollout mới.
2. Recovery xác minh transaction/target/previous, digest/bundle, phase và migration
   hash của cả cụm. Với release đã commit toàn cụm thì verify và finish cleanup;
   với rollout dang dở thì restore previous và verify toàn cụm rồi finish. Trạng
   thái bootstrap/migration không tương thích phải có quyết định operator rõ ràng
   qua Actions và bằng chứng backup/DB, không tự đảo schema/data.
3. Dùng một workflow recovery `workflow_dispatch` nhập transaction cũ, có cùng
   concurrency group và Environment production. Thêm `workflow_run: completed`
   để kích hoạt sau production failure/cancellation; đọc journal trên VPS, chỉ
   checkout mã tin cậy, không thực thi artifact tải từ workflow không tin cậy.
4. Mọi recovery step phải idempotent, kiểm tra owner trong flock; chỉ giải phóng
   journal sau terminal state đã verify. Lưu lịch sử transaction và recovery vào
   artifact/host journal để thấy original failure và recovery outcome riêng.
5. Với yêu cầu tự phục hồi cả khi GitHub/runner mất hoàn toàn, chuyển deploy
   coordinator sang worker bền vững được systemd quản lý hoặc deployment agent có
   journal trên hạ tầng vận hành. Actions gửi yêu cầu và theo dõi; worker tiếp tục
   hoặc recover sau restart. Tránh để vòng đời transaction phụ thuộc SSH session.
6. Có heartbeat/lease để **phát hiện** owner mất liên lạc. Owner mới chỉ được
   takeover sau reconciliation, với fencing/ownership check ngăn process cũ tiếp
   tục ghi. TTL hết hạn một mình không phải bằng chứng container/DB an toàn.

Thứ tự triển khai phù hợp repository hiện tại: recovery workflow production có
nút bấm → pre-deploy reconcile + auto recovery trigger → durable worker nếu cần
chịu được mất GitHub/runner. Cả ba bước đều vận hành qua Actions/agent; không cần
private key trên máy cá nhân để dọn pending khi pipeline lỗi thông thường.

Tài liệu nền: [GitHub cancellation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation),
[workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[systemd service supervision](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
