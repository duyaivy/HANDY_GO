# Kết quả đọc GitHub Actions, 04/11/2026

Chỉ đọc GitHub metadata, logs và artifact; không đọc secret, SSH VPS, dispatch
workflow, chạy migration hay thay đổi production. Artifact là ảnh chụp thời điểm
workflow chạy, không thay thế journal hiện tại trên VPS.

## Bằng chứng

- So sánh `bb756297` với branch `release`: ahead 14, behind 0, không có file khác
  biệt. Bản sửa đã nằm trên release.
- Run `41807950301`, attempt 1, commit `e9777df2c9f83e4128c8113984d9c0e6bbefb917`
  (merge PR #58): verification và publish thành công; deploy thất bại trong
  preflight/reconciliation. Log xác nhận `RUN_MIGRATIONS: true`.
- Artifact `backend-release-41807950301-1` ghi transaction đang reconciliation là
  `prod-20261104-41784967298-a1`, không phải transaction của run mới.
- Recovery decision: `FINISH_SNAPSHOT`; participants chỉ có `vps3`; previous là
  `prod-20261103-41694703128-a1`. Theo state machine, decision này yêu cầu mọi
  participant được chọn có `phase=SNAPSHOT`, `touched=false` và stable không đổi.
- Artifact gốc `backend-release-41784967298-1`: lỗi đầu tiên là
  `New/initial migrations require an explicitly reviewed run_migrations deployment`.
  Chỉ `begin` trên VPS3 được ghi nhận; chưa có prepare/apply. Compensation không
  finish được snapshot vì verify previous trên VPS2 từ chối Order đã restart.
- Run mới gặp lại cùng lỗi verify previous legacy: Order có RestartCount=3.
  Log người dùng cung cấp cho thấy lỗi Prisma P2039/XX000/EMAXCONNSESSION trong
  OrderOutboxPublisher lúc 08:13:11.703 UTC, tiếp theo container StartedAt
  08:13:11.901 UTC và Nest startup lúc 08:13:16 UTC. Đây là bằng chứng mạnh cho
  lần restart gần nhất; chưa phân loại riêng hai lần còn lại.

## Hệ quả vận hành

Merge/publish đã hoàn tất; image mới chưa được apply bởi run 41807950301. Rerun
deploy hoặc bật migrations thêm lần nữa không giải quyết snapshot cũ. Workflow
recovery hiện tại cũng yêu cầu verify previous nên không tự gỡ được vướng mắc này.

Cần đối chiếu journal hiện tại bằng recovery inspect với original run 41784967298,
attempt 1, transaction và target `prod-20261104-41784967298-a1`. Nếu state đã đổi,
không dùng ảnh chụp artifact làm căn cứ mutate. Không xóa pending, đổi hash,
recreate Order để reset counter, hay đánh dấu previous legacy là verified.

Nếu state vẫn FINISH_SNAPSHOT, cần quy trình operator reconciliation được review
cho transaction chưa apply trên VPS3 trong khi previous trên VPS2 bị degraded.
Quy trình phải chứng minh không có application/migration mutation, giữ CAS/fence,
lưu receipt, không chứng nhận previous là ổn định, và giữ đầy đủ verifier cho
forward release mới. Đường thao tác này đã được bổ sung và kiểm thử local như
hướng dẫn bên dưới; chưa thực hiện trên production.

Sau reconciliation mới triển khai release chứa bản sửa, với ENV/budget/DDL endpoint
đã kiểm chứng và migration review. Chưa có quyền hay dữ liệu để xác minh giá trị
plaintext của GitHub production secret hoặc endpoint DB thực từ lượt đọc này.

Nguồn:
- https://github.com/duyaivy/HANDY_GO/actions/runs/41807950301
- https://github.com/duyaivy/HANDY_GO/actions/runs/41784967298

## Thao tác sau khi merge bản sửa recovery mới

Workflow `Backend production transaction recovery` có thêm mode **abort-untouched**,
chỉ chạy thủ công, dùng chung Environment production, cluster lock và session fence.
Các mode inspect/recover cũ và verifier release vẫn giữ nguyên.

1. Đưa bản sửa recovery qua PR/CI, merge main và promote sang release. Không dùng
   Re-run jobs của commit cũ. Kiểm tra shared ENV theo template, endpoint AI thật,
   các ngân sách pool/endpoint runtime và DDL endpoint trước release ứng dụng mới.
2. Chạy workflow recovery trên branch `release`, mode `inspect`, với thông tin:
   - original_run_id: `41784967298`
   - original_attempt: `1`
   - transaction: `prod-20261104-41784967298-a1`
   - target: `prod-20261104-41784967298-a1`
3. Nếu journal hiện tại vẫn đúng transaction trên, decision FINISH_SNAPSHOT,
   participants chỉ VPS3 và SNAPSHOT/touched=false: chạy cùng workflow với cùng
   thông tin, mode `abort-untouched`, confirm `ABORT_UNTOUCHED_SNAPSHOT`.
   Nếu state đã đổi, không áp dụng hướng dẫn từ artifact cũ; đánh giá plan mới.
4. Automation tự quan sát toàn cụm hai lần cách nhau 20 giây: image đúng stable,
   container ID/Created/StartedAt/RestartCount không đổi, running/healthy và không
   OOM; business/network probes và public smoke phải qua. Host đọc lại trạng thái
   sau probe, giữ bằng chứng tối đa 600 giây và recheck trước receipt/unlink.
   Historical restart count được ghi nhận, không reset. Bất kỳ restart/replacement,
   đổi owner/stable, touched=true, phase đã apply/restore/commit hoặc mixed owner
   sẽ chặn thao tác. Không rollback, migrate, recreate hay đổi stable.json.
5. Kết quả cần thấy: `SNAPSHOT_ABORTED_PREVIOUS_NOT_VERIFIED`; receipt có
   `ABORTED_UNTOUCHED_SNAPSHOT` và `release_accepted=false`. Đây là hủy transaction
   chưa apply, không phải chứng nhận ứng dụng cũ hoặc schema đã ổn định. Lỗi giữa
   chừng giữ journal còn lại; có thể chạy lại cùng identity để kiểm tra và hoàn tất.
6. Sau cleanup, tạo **release mới** chứa pool/Outbox/migration/network fixes bằng
   workflow Backend production, migrations bật sau review DDL/schema/backup. ENV
   refresh riêng giữ image/Compose cũ nên chưa đưa đầy đủ bản sửa vào production.

Không tự động dispatch các workflow này trong phiên làm việc. Operator cần theo
dõi pool saturation và budget giai đoạn chuyển tiếp vì image cũ vẫn có pool max
cũ cho tới khi được thay bằng image mới.

## Kiểm thử bản sửa recovery local

- `python3 -m unittest discover -s deploy/production/tests -v`: exit 0,
  197 tests, 2 opt-in tests skipped. Có 16 regression mới cho abort snapshot/CLI:
  snapshot untouched, migration hash khác nhưng chưa apply, touched/applying,
  mixed/wrong owner, restart/replacement/StartedAt đổi, stale fence, age, smoke
  lỗi, state đổi trong observation, receipt ghi lỗi, crash trước unlink và retry
  cleanup một phần. Verifier legacy vẫn được các test cũ kiểm tra.
- `docker run --rm -v /Users/apple/QUOCDUY/PBL6:/repo:ro rhysd/actionlint:1.7.7 /repo/.github/workflows/backend-production-recovery.yml`:
  exit 0, chỉ container kiểm thử local và mount source read-only.
- `/tmp/production-validation/bin/python scripts/check-production-config.py`: exit 0.
- `PYTHONPYCACHEPREFIX=/tmp/handygo-pycache python3 -m compileall -q deploy/production`: exit 0.
- `git diff --check`: exit 0.

Reviewer agent độc lập đã tìm thấy khoảng hở restart trong lúc probe. Đã sửa bằng
post-probe reinspection, kiểm tra lại toàn host và freshness ngay trước receipt;
hai regression tương ứng đều pass. Reviewer chạy độc lập 15 tests của
`test_snapshot_abort.py`, exit 0, và xác nhận không còn blocking finding. Chưa
chạy mode mới trên production; không cần chạy lại TS build/typecheck cho bản sửa
này vì chỉ thay Python, workflow và tài liệu, không thay runtime TypeScript.
