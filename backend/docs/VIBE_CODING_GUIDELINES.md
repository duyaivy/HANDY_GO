# CẨM NANG VIBE CODING CHUẨN KIẾN TRÚC DÀNH CHO LẬP TRÌNH VIÊN (HANDY GO)

> **Mục tiêu:** Hướng dẫn các lập trình viên cách tương tác, lèo lái (steer) và tận dụng tối đa sức mạnh của AI Coding Agent (Cursor, Antigravity, Copilot, Windsurf) để phát triển backend nhanh, chuẩn kiến trúc Feature-Based, không tạo ra "nợ kỹ thuật" (technical debt).

---

## 1. Triết lý "Vibe Coding Chuẩn" là gì?

> [!NOTE]
> **Vibe Coding KHÔNG PHẢI là:**
> - Viết một dòng prompt sơ sài rồi phó mặc cho AI sinh mã vô tội vạ.
> - Để AI tự tạo các tầng layer hỗn loạn (`src/controllers/`, `src/services/`, `src/flows/` gom tụ ở root).
> - Để AI "phát minh lại bánh xe" (tự viết lại hàm hash mật khẩu, tự viết lại hàm chuẩn hóa SĐT, tự viết lại JWT signer...).

> [!TIP]
> **Vibe Coding CHUẨN là:**
> - Bạn đóng vai trò **Tech Lead / Software Architect**: Định hình ranh giới nghiệp vụ (Boundaries), kiểm soát kiến trúc và đưa ra các quy tắc ràng buộc nghiêm ngặt.
> - AI Agent đóng vai trò **Senior Developer tốc độ cao**: Đọc hiểu context dự án, tái sử dụng các thư viện sẵn có (`@app/*`), sinh mã feature khép kín và tự vượt qua các bài kiểm thử tự động (Quality Gate).

---

## 2. Các quy tắc "Bất di bất dịch" khi Vibe Code

Mỗi khi mở một phiên chat mới với AI Agent, hãy luôn ghi nhớ 4 quy tắc vàng sau:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   4 NGUYÊN TẮC VIBE CODING VÀNG                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Context First     : Bắt Agent đọc file AGENTS.md đầu tiên           │
│ 2. Plan Before Code  : Luôn yêu cầu Agent lên Plan trước khi viết mã   │
│ 3. Reuse Everything  : Không cho phép Agent viết lại utils/libs có sẵn │
│ 4. Quality Gate 100% : Bắt buộc pass: Test + Typecheck + Lint          │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Context First (Ngữ cảnh là trên hết):**
   Trong Monorepo `backend`, tất cả quy chuẩn kiến trúc và danh mục tái sử dụng được lưu tại [backend/AGENTS.md](file:///Users/apple/QUOCDUY/PBL6/backend/AGENTS.md). Luôn nhắc Agent: *"Read AGENTS.md carefully before proceeding"*.
2. **Feature-Based Isolation (Cô lập theo tính năng):**
   Mỗi tính năng mới phải là một thư mục độc lập trong `src/<feature-name>/`, bao gồm: Module, Controller, Service, DTO và Test riêng. Cấm tạo controller/service dùng chung ở root.
3. **Tái sử dụng tối đa (Reuse First):**
   Yêu cầu Agent tra cứu bảng **Reusable Component Registry** trong [AGENTS.md](file:///Users/apple/QUOCDUY/PBL6/backend/AGENTS.md) trước khi code. Đã có `@app/common`, `@app/auth`, `@app/database`, `RateLimiterService`, `PhoneUtil`... thì bắt buộc phải dùng, không tự viết lại.
4. **Bắt Agent tự cập nhật tài liệu:**
   Khi Agent vừa tạo một helper hay service có khả năng dùng lại, bắt Agent phải tự cập nhật vào [AGENTS.md](file:///Users/apple/QUOCDUY/PBL6/backend/AGENTS.md).

---

## 3. Quy trình Vibe Coding 4 bước thực chiến (Prompt Templates in English)

### Bước 1: Prompt Phân tích & Lên Kế hoạch (Planning Prompt)
*Đừng bao giờ bảo AI "code ngay đi". Hãy bắt AI phân tích và lập kế hoạch trước.*

> **Mẫu Prompt (English):**
> ```markdown
> Read AGENTS.md carefully to understand the Feature-Based architectural standards and the monorepo's reusable registry.
> I want to implement the [Feature Name, e.g., Password Reset] feature in [apps/auth-service].
> Do NOT write code yet. First, analyze and plan:
> 1. Which HTTP endpoints, methods, and DTOs are required?
> 2. Which existing utilities and services from @app/* and common/ can be reused?
> 3. What will the planned directory structure inside src/[feature-name]/ look like?
> Provide a step-by-step implementation plan for my review before writing any code.
> ```

---

### Bước 2: Triển khai mã nguồn khép kín (Implementation Prompt)
*Sau khi bạn duyệt plan, yêu cầu AI sinh mã theo đúng khung Feature Module.*

> **Mẫu Prompt (English):**
> ```markdown
> The plan looks good. Please proceed with the implementation!
> Strict architectural constraints to follow:
> - Place all code inside `src/[feature-name]/`.
> - Must include dedicated controller, service, module, DTOs, and unit tests (*.spec.ts).
> - Reuse `AppException` from `@app/common`, `resolveClientIp` from `common/utils/client-ip.util.ts`, and existing shared infrastructure.
> - Register the new feature module in the service's root module.
> ```

---

### Bước 3: Ép chạy Quality Gate (Quality Gate Prompt)
*Không bao giờ tin tưởng code của AI khi chưa chạy test thực tế.*

> **Mẫu Prompt (English):**
> ```markdown
> Implementation complete. Now, autonomously run the 3-step Quality Gate verification and report the results:
> 1. pnpm test apps/[service-name]
> 2. pnpm run typecheck
> 3. pnpm run lint
> If any test, typecheck, or lint error occurs, fix it autonomously until everything passes with zero errors and zero warnings!
> ```

---

### Bước 4: Tự động cập nhật Registry (Update Registry Prompt)
*Bảo tồn tri thức cho các phiên code tiếp theo.*

> **Mẫu Prompt (English):**
> ```markdown
> During this implementation, did you create or modify any helper, utility function, DTO, RPC client, or service that can be reused across other features or services?
> If so, immediately update Section 4 ("Reusable Component Registry") in AGENTS.md with the component name, file path, purpose, and usage contract.
> ```

---

## 4. Các mẫu Prompt "Thần chú" cho từng tình huống (Scenario Templates)

### Tình huống 1: Refactor một module bị lộn xộn (như đã làm với auth-service)
```markdown
Audit the src directory of [service-name]. Analyze whether it is split by layer or feature.
Identify any legacy files, duplicate shims, or monolithic controllers/services.
Formulate a comprehensive plan to refactor it into self-contained Feature-Based modules adhering strictly to AGENTS.md.
```

### Tình huống 2: Tạo một API endpoint mới trong Feature có sẵn
```markdown
In feature [feature-name, e.g., login], I want to add endpoint [POST /auth/change-password].
Please:
1. Create ChangePasswordDto with complete class-validator rules.
2. Implement the handler method in LoginService and LoginController.
3. Reuse TokenSignerService / SessionService from common.
4. Write unit tests for both the controller and service covering edge cases.
5. Run `pnpm test apps/[service-name]` and `pnpm run typecheck` to verify.
```

### Tình huống 3: Tích hợp gọi RPC giữa 2 microservices
```markdown
I need to query [user-trust-service] to verify worker KYC profile status.
Review the @app/rabbitmq library and existing RPC patterns in common/rpc/.
Implement a Fail-Close RPC client with a 10s timeout, graceful exception handling via AppException, and zero state corruption on failure.
```

### Tình huống 4: Tự động sửa lỗi khi test hoặc typecheck bị fail
```markdown
The test suite or typecheck failed with the following error:
[paste error output or describe symptom]
Analyze the root cause, check existing patterns in AGENTS.md, and resolve the issue without breaking existing API contracts or architectural boundaries. Run the quality gate to verify your fix.
```

---

## 5. Bảng tra cứu "Vũ khí có sẵn" (Cheat Sheet)

Hãy nhắc AI dùng ngay các thành phần này, **không được code lại**:

| Nhu cầu nghiệp vụ | Thành phần có sẵn cần dùng | Vị trí import |
| :--- | :--- | :--- |
| **Ném lỗi API (Bad request, Conflict, 404...)** | `throw new AppException(status, code, msg, { details })` | `@app/common` |
| **Chuẩn hóa số điện thoại VN sang E.164** | `normalizeVietnamesePhone(rawPhone)` | `common/utils/phone.util.js` |
| **Lấy IP Client chống giả mạo (Anti-Spoofing)** | `resolveClientIp(config, req, fallbackIp)` | `common/utils/client-ip.util.js` |
| **Ký / Kiểm tra JWT RS256** | `TokenSignerService`, `TokenVerifierService` | `@app/auth` |
| **Bảo vệ endpoint bằng quyền RBAC** | `@RequirePermissions(StandardPermissions.XYZ)` | `@app/auth` |
| **Mở public API không cần token** | `@Public()` | `@app/auth` |
| **Lấy user đang đăng nhập** | `@CurrentUser() user: AuthenticatedUser` | `@app/auth` |
| **Gửi Domain Event tin cậy (Outbox)** | `OutboxPublisherService.triggerPublish()` | `@app/common` |
| **Render email HTML gửi khách hàng** | `renderEmailTemplate('template.html', vars)` | `@app/common` |
| **Giới hạn số lần gọi (Rate limit, chống Brute-Force)**| `RateLimiterService` | `common/rate-limit/rate-limiter.service.js` |
| **Quản lý Session & Refresh Token** | `SessionService` | `common/session/session.service.js` |

---

## 6. Lời kết

Vibe Coding với AI Agent là một kỹ năng làm việc cộng tác. Khi bạn nắm vững việc **lèo lái kiến trúc (Steering)** và đặt ra các **chốt chặn chất lượng (Quality Gates)**, AI Agent sẽ trở thành một trợ thủ đắc lực giúp bạn xây dựng hệ thống microservices mạnh mẽ, đồng nhất và bền bỉ.
