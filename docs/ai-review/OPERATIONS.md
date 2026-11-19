# Cẩm nang Vận hành và Xử lý Sự cố Owlet Lens (Operations Runbook)

Tài liệu này cung cấp cho các kỹ sư DevOps và Tech Lead quy trình giám sát, tra cứu log, kiểm soát chi phí và xử lý các sự cố thường gặp khi vận hành Owlet Lens.

---

## 1. Hướng dẫn Tra cứu Log Thực thi

1. Mở Pull Request cần kiểm tra trên GitHub.
2. Bấm vào tab **Checks** hoặc đường link trạng thái của workflow **PR CI**.
3. Chọn job **Owlet Lens AI Code Review** (`ai-review`).
4. Mở rộng bước **Run Owlet Lens Review**.
5. Các chỉ số quan trọng được in ra trong log:
   - Số lượng dòng thay đổi trong diff và danh sách các file được chọn để phân tích.
   - Các file tài liệu ngữ cảnh được nạp và ước lượng token đầu vào.
   - Tên nhà cung cấp và model AI đang phục vụ lượt review.
   - Kết quả của lượt phản biện thứ 2 (bao nhiêu cảnh báo được giữ lại, bao nhiêu cảnh báo bị loại bỏ vì là false-positive).
   - Mã thoát (exit code) và tổng thời gian xử lý.
   - Chi phí tích lũy ước tính (USD) cho Pull Request qua các lần push.

---

## 2. Xử lý các Sự cố Thường gặp

### Sự cố 1: AI Review không Chạy trên Pull Request
- **Kiểm tra trạng thái CI Gate**: Kiểm tra xem có job nào trong `backend-ci`, `tracking-integration`, `frontend-ci`, `mobile-ci` hoặc `ai-ci` bị lỗi không. Nếu có, `ci-gate` thất bại và AI Review được bỏ qua theo đúng thiết kế.
- **Kiểm tra phần mô tả PR**: Xem trong phần mô tả có chứa thẻ `[skip-ai-review]` không.
- **Kiểm tra biến toàn cục**: Kiểm tra biến `AI_REVIEW_ENABLED` trong mục Settings $\rightarrow$ Variables có đang bị đặt là `false` không.
- **Kiểm tra nguồn gốc PR**: Nếu PR được tạo từ một fork công khai bên ngoài, GitHub mặc định không cấp quyền đọc Secret, khiến AI không có API key để chạy.

### Sự cố 2: Lỗi Kết nối Mạng `LLM call failed: fetch failed`
- **Dấu hiệu**: Log xuất hiện các mã lỗi `ECONNREFUSED`, `ETIMEDOUT` hoặc `UND_ERR_CONNECT_TIMEOUT`.
- **Nguyên nhân**: Kết nối mạng từ runner của GitHub Actions tới endpoint của nhà cung cấp AI bị chặn hoặc gián đoạn.
- **Cách khắc phục**:
  1. Kiểm tra trang trạng thái dịch vụ của nhà cung cấp AI (Anthropic Status, Google Cloud Status, OpenAI Status).
  2. Nếu dùng gateway VPS riêng, kiểm tra tường lửa (firewall/UFW) và phân giải DNS của VPS.
  3. Cấu hình sẵn `fallbackModels` trong `ai-review.config.yaml` để hệ thống tự động chuyển sang nhà cung cấp phụ khi nhà cung cấp chính gặp sự cố.

### Sự cố 3: Lỗi Vượt quá Giới hạn Tần suất (Rate Limit 429)
- **Nguyên nhân**: Tài khoản AI chạm ngưỡng giới hạn request/phút (RPM) hoặc token/phút (TPM) của nhà cung cấp.
- **Cách khắc phục**:
  1. Cấu hình mô hình dự phòng khác provider trong `fallbackModels` (ví dụ chuyển tiếp từ `anthropic` sang `gemini:gemini-2.5-pro`).
  2. Nâng cấp hạn mức (Tier) tài khoản tại nhà cung cấp AI.

### Sự cố 4: Thread đã Sửa nhưng Nút "Resolved" trên GitHub UI không Đổi màu Xanh
- **Nguyên nhân**: Token mặc định `GITHUB_TOKEN` của GitHub Actions không có scope `repo` để gọi GraphQL mutation thay đổi cờ hiển thị của GitHub.
- **Mức độ ảnh hưởng**: Hoàn toàn **không ảnh hưởng** tới tính chính xác. Owlet Lens theo dõi trạng thái thread thông qua comment ẩn (`<!-- ai-review:v1:fixed -->`).
- **Cách khắc phục**: Nếu muốn nút UI đổi màu tự động, tạo một Personal Access Token (PAT) có scope `repo` và lưu vào GitHub Secrets với tên `AI_REVIEW_RESOLVE_TOKEN`.

---

## 3. Kiểm soát Hạn mức Token và Chi phí Sử dụng

### Giới hạn Ngân sách Token (Token Budget)
- Tham số `review.tokenBudget` được giới hạn tối đa `512000` token cho mỗi lượt review.
- Nếu PR có diff quá lớn vượt ngưỡng này, Owlet Lens sẽ ưu tiên phân tích các file nghiệp vụ cốt lõi thay vì báo lỗi dừng cuộc gọi.

### Loại bỏ các File Không Cần thiết
- Tham số `review.skipGeneratedFiles: true` tự động loại bỏ các file phát sinh:
  - File migration cơ sở dữ liệu (`prisma/migrations/**`).
  - File khóa thư viện (`pnpm-lock.yaml`, `package-lock.json`).
  - Thư mục build (`dist/`, `build/`, `.next/`).
  - Thư mục mock và test fixture (`__mocks__/**`, `fixtures/**`).
- Tham số `review.skipUnchanged: true` sẽ bỏ qua việc review lại nếu diff không có sự thay đổi thực chất (ví dụ commit merge từ nhánh `main` vào).

### Báo cáo Chi phí Tích lũy
Owlet Lens lưu trữ chi phí tích lũy qua các lần chạy trên cùng một PR bằng cơ chế cache của GitHub Actions. Comment tổng kết trên PR sẽ hiển thị minh bạch:
```markdown
Cumulative cost: $0.0184 over 3 review run(s)
```
