# Hướng dẫn Thiết lập và Vận hành Owlet Lens AI Code Review cho HANDY_GO

Tài liệu này hướng dẫn chi tiết cách cấu hình, vận hành và quản lý công cụ đánh giá mã nguồn tự động Owlet Lens trong kho mã nguồn HANDY_GO.

---

## 1. Cơ chế Hoạt động & Điểm Kích hoạt

Owlet Lens được tích hợp trực tiếp vào quy trình kiểm thử CI của dự án tại `.github/workflows/pr-ci.yml` dưới dạng job `ai-review`.

**Nguyên tắc Bắt buộc**:
Job `ai-review` phụ thuộc trực tiếp vào `ci-gate` (`needs: ci-gate`). Job này **chỉ được phép thực thi khi và chỉ khi** toàn bộ các bước kiểm tra chất lượng (build, lint, typecheck, unit test, integration test) đều đạt trạng thái `success`. Nếu bất kỳ bài kiểm tra nào thất bại hoặc bị hủy, AI Review sẽ bị bỏ qua hoàn toàn.

---

## 2. Các Bước Cấu hình trên GitHub

### 2.1 Cấu hình GitHub Actions Secrets
Truy cập: **Repository $\rightarrow$ Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions $\rightarrow$ Secrets**

| Tên Secret | Bắt buộc | Mô tả |
|---|---|---|
| `ANTHROPIC_API_KEY` | Tùy chọn (Theo provider) | API key nếu sử dụng mô hình Claude của Anthropic (khuyên dùng `claude-sonnet-4-6` hoặc `claude-opus-4-7`). |
| `GEMINI_API_KEY` | Tùy chọn (Theo provider) | API key nếu sử dụng Google Gemini (ví dụ: `gemini-2.5-pro` hoặc `gemini-2.5-flash`). |
| `OPENAI_API_KEY` | Tùy chọn (Theo provider) | API key nếu sử dụng OpenAI hoặc endpoint tương thích. |
| `DEEPSEEK_API_KEY` | Tùy chọn (Theo provider) | API key nếu sử dụng DeepSeek (ví dụ: `deepseek-chat`). |
| `AI_REVIEW_RESOLVE_TOKEN` | Tùy chọn | GitHub Personal Access Token (PAT) có scope `repo`. Cho phép Owlet Lens tự động chuyển nút "Resolved" trên giao diện GitHub sang màu xanh khi lỗi đã được lập trình viên sửa. |

### 2.2 Cấu hình GitHub Actions Variables (Tùy biến không cần sửa code)
Truy cập: **Repository $\rightarrow$ Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions $\rightarrow$ Variables**

| Tên Biến (Variable) | Giá trị Mặc định | Chức năng |
|---|---|---|
| `AI_REVIEW_LLM_PROVIDER` | `anthropic` | Nhà cung cấp AI được chọn (`anthropic`, `gemini`, `deepseek`, `openai`). |
| `AI_REVIEW_MODEL` | `claude-sonnet-4-6` | Định danh mô hình AI dùng để review code. |
| `AI_REVIEW_REPLY_MODEL` | `claude-haiku-4-5-20251001` | Mô hình gọn nhẹ dùng cho lượt phản biện (reflection) và trả lời thảo luận. |
| `AI_REVIEW_ENABLED` | `true` | Đặt thành `false` nếu muốn tạm dừng tính năng AI Review trên toàn bộ repository mà không cần sửa code. |
| `AI_REVIEW_ALLOWED_HOSTS` | Trống | Danh sách hostname hợp lệ khi trỏ tới gateway OpenAI tương thích bên ngoài (ví dụ domain VPS). |

---

## 3. Cấu hình Chi tiết tại `ai-review.config.yaml`

File cấu hình chính đặt tại thư mục gốc của repository:

```yaml
version: 1

review:
  provider: anthropic
  model: claude-sonnet-4-6
  fallbackModels:
    - gemini:gemini-2.5-pro
    - deepseek:deepseek-chat
  severityThreshold: medium
  testFileSeverityThreshold: high
  noiseCategories: [style, naming]
  skipGeneratedFiles: true
  skipUnchanged: true
  reflection: true
  detectBreakingChanges: true
  tokenBudget: 512000
  codingStandardsPath: ./docs/ai-review/REVIEW_GUIDELINES.md
  contextPaths:
    - ./docs/ai-review/ARCHITECTURE.md
    - ./docs/ai-review/SERVICE_BOUNDARIES.md
    - ./docs/ai-review/BUSINESS_INVARIANTS.md
    - ./docs/ai-review/EVENT_CONTRACTS.md
    - ./docs/ai-review/SECURITY_RULES.md

reply:
  provider: anthropic
  model: claude-haiku-4-5-20251001

auth:
  anthropicKey: ${ANTHROPIC_API_KEY}
  geminiKey: ${GEMINI_API_KEY}
  deepseekKey: ${DEEPSEEK_API_KEY}
  openaiKey: ${OPENAI_API_KEY}
```

---

## 4. Cách Bật / Tắt AI Review Linh hoạt

### Bỏ qua Review trên một Pull Request cụ thể
Thêm thẻ `[skip-ai-review]` vào bất kỳ đâu trong phần mô tả (description body) của Pull Request:
```markdown
## Tóm tắt thay đổi
Sửa lỗi chính tả trong file tài liệu.

[skip-ai-review]
```
Workflow sẽ kiểm tra điều kiện `!contains(github.event.pull_request.body, '[skip-ai-review]')` và tự động bỏ qua job `ai-review`.

### Tắt trên Toàn bộ Repository
Vào mục Variables trên GitHub và đặt `AI_REVIEW_ENABLED = false`.

---

## 5. Chuẩn bị cho Tương lai: Tích hợp ChatGPT Web Gateway trên VPS Riêng

Khi bạn triển khai xong ChatGPT Web Gateway bằng Docker trên VPS cá nhân của mình, bạn có thể dễ dàng chuyển sang dùng gateway này mà không cần thay đổi cấu trúc CI:

1. **Khai báo domain VPS vào danh sách host được phép**:
   - Trong GitHub Variables, thêm biến `AI_REVIEW_ALLOWED_HOSTS` chứa domain/IP VPS của bạn (ví dụ: `gateway.yourdomain.com`).
2. **Cấu hình trỏ tới Gateway**:
   - Đặt `AI_REVIEW_LLM_PROVIDER: openai`
   - Đặt `AI_REVIEW_BASE_URL: https://gateway.yourdomain.com/v1`
   - Thêm secret `OPENAI_API_KEY` nếu gateway của bạn có yêu cầu mã token bảo vệ.
3. Owlet Lens sẽ tự động gửi request dạng OpenAI Chat Completion tới gateway của bạn trên VPS.
