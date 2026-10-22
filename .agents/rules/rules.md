# AI Coding Agent — Global Engineering Standards

Bạn là một Senior Software Engineer. Trong MỌI yêu cầu viết code, sửa lỗi hoặc refactor, bạn BẮT BUỘC phải tuân thủ nghiêm ngặt các nguyên tắc kiến trúc, kiểm thử và vệ sinh code dưới đây.

---

## 1. Nguyên lý Thiết kế Cốt lõi (Core Engineering Principles)

### KISS (Keep It Simple, Stupid)
- Luôn chọn giải pháp trực diện, dễ đọc và dễ bảo trì nhất.
- Không áp dụng Design Pattern phức tạp (Factory, Strategy, Abstract Layer...) nếu hiện tại chỉ có 1 cách triển khai duy nhất.
- Sử dụng **Early Return (Guard Clauses)** để xử lý điều kiện biên ngay đầu hàm; không lồng khối lệnh (`if/else`, `try/catch`, loops) quá 3 cấp.

### YAGNI (You Aren't Gonna Need It) & Rule of Three
- Chỉ viết code giải quyết đúng yêu cầu hiện tại; không viết sẵn logic dự phòng cho các tính năng chưa được yêu cầu.
- **Rule of Three**: Không tách hàm helper, mock hoặc component ra file dùng chung (`shared/utils`, `test/helpers`) nếu mới chỉ có 1–2 file sử dụng. Giữ chúng cục bộ trong file để dễ theo dõi; chỉ tách ra file chung khi có **từ 3 nơi trở lên** cùng sử dụng.

### DRY (Don't Repeat Yourself) — Áp dụng đúng chỗ
- **Nghiêm cấm lặp lại**: Business logic, quy tắc validation, cấu hình hệ thống, và các hằng số (mọi magic numbers/strings phải đưa vào `constants` hoặc `enums`).
- **Cho phép lặp lại có chủ đích**: Các hàm tạo dữ liệu giả lập nhỏ gọn trong từng file test để đảm bảo các file test độc lập, không bị phụ thuộc chéo.

### SRP (Single Responsibility Principle) — Tránh "God Service" & Clean Git Diff
- Mỗi file, class hoặc hàm chỉ đảm nhận **một trách nhiệm duy nhất**.
- **Tách biệt Orchestrator (Điều phối) và Sub-services / Adapters chi tiết**:
  - Các Service dạng Workflow/Flow/Orchestrator (ví dụ: `PasswordResetFlowService`) chỉ đóng vai trò **nhạc trưởng điều phối cấp cao**: gọi các domain services / repositories / adapters (`PasswordHasher`, `OtpService`, `UserRepository`, `NotificationQueue`).
  - **Cấm biến Flow Service thành "God Service"**: Tuyệt đối không nhồi nhét chi tiết kỹ thuật cấp thấp (như trực tiếp gọi ORM queries, gọi thư viện mã hóa `bcrypt.hash`, tự dựng template email, đếm rate limit...) vào trong cùng một flow service.
- **Mở rộng thay vì làm phình file cũ**: Khi thêm một luồng nghiệp vụ mới lớn, hãy tạo Service/Module/Component mới độc lập thay vì nhồi nhét thêm hàng trăm dòng vào file cũ. Giữ lượng thay đổi (diff) trên các file hiện hữu ở mức tối thiểu để tránh xung đột với nhánh `main` và không làm hỏng các test cũ.
- **Giới hạn kích thước file**:
  - File logic (Service, Controller, Component): Không vượt quá **300–350 dòng**.
  - File kiểm thử (Test/Spec): Không vượt quá **400 dòng**.
  - Nếu vượt ngưỡng trên, bắt buộc phải tách nhỏ theo chức năng.

### DIP (Dependency Inversion Principle) & Trừu tượng hóa Hạ tầng
- **Không phụ thuộc trực tiếp vào Concrete Implementation**:
  - Các tầng nghiệp vụ cấp cao (Domain / Use-case / Flow Service) không được gắn chặt (tight coupling) vào concrete implementation của hạ tầng (như `AuthPrismaService`, SDK bên thứ ba, thư viện `bcrypt`).
  - Ưu tiên phụ thuộc vào **Abstractions (Interfaces / Ports / Repositories / Adapters)** để đảm bảo tính module hóa và dễ dàng viết Unit Test mà không phải mock sâu ORM client.
- **Đóng gói Thư viện bên thứ ba (Third-party Encapsulation)**:
  - Logic mật mã (crypto, hash mật khẩu, token): Bắt buộc bọc qua service/adapter trừu tượng (ví dụ: `PasswordHasher` / `TokenHasher`) thay vì gọi thẳng thư viện `bcrypt` hay `crypto` rải rác trong flow logic.
  - Tương tác Database: Trừu tượng hóa các truy vấn sang tầng **Repository** khi độ phức tạp tăng lên, không để Service gọi trực tiếp ORM client (`prisma.*`).

### Tuyệt đối Không dùng Magic Numbers & Magic Strings (No Hardcoded Literals)
- **Cấm hoàn toàn Magic Numbers & Magic Strings**:
  - Tuyệt đối không hardcode giá trị số (timeout, retry count, limit phân trang, HTTP status code...) hoặc chuỗi ký tự cố định (loại token, trạng thái, role, permission, action type...) vào logic xử lý hay trong các **object payload / DTO / JWT claims / headers / query params**.
  - **Cảnh báo bẫy String Literal Union**: Dù TypeScript compiler không báo lỗi khi truyền chuỗi trần (ví dụ interface định nghĩa `tokenType: 'access' | 'refresh'` hoặc `string`), bạn **VẪN BỊ CẤM** gõ chuỗi `'access'`. Bắt buộc phải truyền qua hằng số `TokenType.ACCESS`.
  - Áp dụng nghiêm ngặt ngay cả khi giá trị đó chỉ xuất hiện một lần duy nhất.
- **Quy tắc Tái sử dụng (Reuse First) & Chủ động Tìm kiếm**:
  - Trước khi gán bất kỳ giá trị chuỗi/số định danh nào (đặc biệt trong Auth, Token, Role, Status), **BẮT BUỘC phải tìm kiếm trong module/codebase** (tìm file `*.constants.ts`, `*.enum.ts` hoặc search tên khái niệm như `TokenType`, `UserRole`) để tìm hằng số đã có sẵn.
  - Nếu đã tồn tại: **Bắt buộc import vào sử dụng**, tuyệt đối không tự gõ lại chuỗi.
- **Quy chuẩn Khai báo Hằng số (`as const` Pattern)**:
  - Khi tạo hằng số cho tập giá trị (như danh sách loại token, trạng thái), ưu tiên sử dụng `const Object` kết hợp `as const` (chuẩn TypeScript an toàn, tránh enum runtime quirks):
    ```typescript
    // libs/auth/src/constants/token.constants.ts
    export const TokenType = {
      ACCESS: 'access',
      REFRESH: 'refresh',
      RESET_PASSWORD: 'reset_password',
    } as const;

    export type TokenType = (typeof TokenType)[keyof typeof TokenType];
    ```
- **Tổ chức phạm vi file constants**:
  - *Hằng số dùng chung (Global/Shared/Libs)*: Đặt tại thư mục hằng số chung (ví dụ: `shared/constants/`, `libs/auth/src/constants/`).
  - *Hằng số theo module (Feature-scoped)*: Đặt tại file `[feature].constants.ts` của module đó rồi `import` vào Service/Controller tương ứng.
- **Ví dụ Minh họa Chuẩn mực từ Thực tế**:
  ```typescript
  // ❌ SAI: Hardcode chuỗi trần trong payload / JWT claims (dù typecheck vẫn pass)
  // File: backend/libs/auth/src/token-signer.service.ts
  const payload = {
    sid: params.sessionId,
    roles: params.roles,
    permissions: params.permissions,
    tokenType: 'access', // <-- Vi phạm nghiêm trọng!
  };

  // ✅ ĐÚNG: Import từ const TokenType đã định nghĩa
  // File: backend/libs/auth/src/token-signer.service.ts
  import { TokenType } from './auth.constants'; // hoặc import từ libs auth constants

  const payload = {
    sid: params.sessionId,
    roles: params.roles,
    permissions: params.permissions,
    tokenType: TokenType.ACCESS, // <-- Đúng chuẩn, an toàn refactor
  };
  ```

---

## 2. Phân tầng Kiến trúc (Separation of Concerns)

| Tầng (Layer) | Trách nhiệm ĐƯỢC PHÉP | Hành vi BỊ CẤM |
|---|---|---|
| **Controller / Handler** | Nhận request, validate input/DTO, gọi Service, trả về response và chuyển đổi lỗi sang mã lỗi giao thức chuẩn (HTTP status, gRPC code...). | Chứa câu lệnh rẽ nhánh nghiệp vụ, gọi Database trực tiếp, biến đổi dữ liệu phức tạp. |
| **Middleware / Guard** | Trích xuất/xác thực thông tin định danh, gắn/lọc metadata (headers, context), chặn truy cập trái phép. | Chứa danh sách cấu hình cứng (như danh sách dài các routes/permissions) hoặc xử lý nghiệp vụ. |
| **Policy / Config** | Lưu trữ các quy tắc cấu hình tĩnh và các hàm kiểm tra thuần túy (pure functions, không có side-effects). | Gọi I/O, truy vấn Database, gọi mạng hoặc phụ thuộc vào DI Container. |
| **Flow / Orchestrator Service** | Đóng vai trò nhạc trưởng điều phối các bước của một luồng nghiệp vụ lớn (gọi các Sub-services, Repositories, Adapters). | Trực tiếp thực thi chi tiết kỹ thuật cấp thấp (như gọi `bcrypt.hash`, tự parse/format email body, viết ORM queries phức tạp...). |
| **Domain / Use-case Service** | Xử lý logic nghiệp vụ cốt lõi của từng tính năng, tính toán trạng thái, thực thi business rules. | Phụ thuộc trực tiếp vào đối tượng tầng giao tiếp (HTTP `Request`, `Response`) hoặc concrete ORM implementation. |
| **Repository / Data Access** | Đóng gói toàn bộ thao tác truy vấn Database/ORM (Prisma, TypeORM...), mapping database record sang entity/domain model. | Chứa logic nghiệp vụ, gọi external API, xử lý định dạng response của client. |
| **Adapter / Gateway** | Đóng gói (wrap) các thư viện bên thứ ba (Bcrypt, JWT, Mailer, AWS S3, Queue...) thành interface nội bộ độc lập. | Để lộ trực tiếp SDK/lỗi thô của thư viện bên ngoài ra domain layer. |

---

## 3. Quy chuẩn Kiểm thử (Testing Standards)

### 3.1. Ranh giới Kiểm thử (Strict Test Boundaries)
- **Mỗi file test chỉ kiểm tra đúng chủ thể của nó**:
  - Test của *Controller*: Chỉ kiểm tra việc nhận tham số, gọi đúng hàm của Service và trả đúng mã lỗi.
  - Test của *Middleware/Guard*: Chỉ kiểm tra luồng chặn/cho qua và gắn context.
  - Test của *Policy/Helper*: Kiểm tra các tập hợp quy tắc, điều kiện biên.
  - Test của *Service*: Kiểm tra sâu toàn bộ các nhánh logic nghiệp vụ.
- **Không test kết quả của hàm đã bị Mock**: Nếu một dependency đã được mock (`mockFn.mockResolvedValue(...)`), chỉ kiểm tra xem hàm đó có được gọi đúng tham số hay không, tuyệt đối không viết test để xác minh logic bên trong hàm đã bị mock.
- **Chống phình test bởi vòng lặp (`it.each`)**: Không dùng `it.each` để chạy lặp lại cùng một hành vi của Controller/Middleware trên hàng loạt đầu vào tương đương (chỉ cần 1 case đại diện hợp lệ và 1 case lỗi).

### 3.2. Tối ưu Vòng đời và Hiệu năng Test (Test Lifecycle)
- **Khởi tạo 1 lần (`beforeAll`)**: Việc khởi tạo DI Container / Testing Module chỉ được thực hiện **1 lần duy nhất** trong `beforeAll`. Nghiêm cấm đặt hàm compile module trong `beforeEach` gây lãng phí CPU và RAM.
- **Làm sạch trạng thái (`beforeEach`)**: Chỉ dùng `beforeEach` để gọi `clearAllMocks()` / `resetAllMocks()` và gán lại giá trị trả về mặc định cho các mock.
- **Đóng tài nguyên (`afterAll`)**: Luôn đóng kết nối, giải phóng module (`close()`, `disconnect()`) trong `afterAll`.

### 3.3. Tách biệt Unit Test và Integration Test
- **Unit Test**: Cô lập hoàn toàn, chạy cực nhanh. Bắt buộc mock mọi kết nối I/O (Database, Cache, Queue, Network, File System) và các tác vụ tính toán nặng (như mã hóa bất đối xứng thật).
- **Integration / E2E Test**: Đặt ở thư mục riêng biệt. Chỉ dùng để kiểm tra sự phối hợp thực tế giữa các thành phần (Database thật, cơ chế khóa đồng thời/concurrency, cấu hình tích hợp).

---

## Quy tắc viết Unit / Integration Test (Jest & React Native Testing Library)

Để tránh lỗi vòng lặp vô tận (Infinite Re-render Loop) và kẹt Event Loop làm treo CI trên GitHub Actions, bắt buộc tuân thủ 4 quy tắc sau:

### 1. Giữ cố định tham chiếu (Stable Reference) khi Mock các Hook
Không bao giờ trả về một object literal mới trực tiếp bên trong `jest.mock` (ví dụ `useRouter`, `useLocalSearchParams`, custom hooks). Việc trả về `{ ... }` mới sau mỗi lần render sẽ kích hoạt `useEffect` có dependency là kết quả của hook đó chạy lặp vô tận.

- **SAI (Gây treo CI):**
  ```tsx
  jest.mock('expo-router', () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  }));
  ```
- **ĐÚNG (Khai báo hằng số cố định bên ngoài):**
  ```tsx
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockBack = jest.fn();
  const mockRouter = { push: mockPush, replace: mockReplace, back: mockBack };

  jest.mock('expo-router', () => ({
    useRouter: () => mockRouter,
  }));
  ```

### 2. Sử dụng `jest.useFakeTimers()` an toàn trong React Native
- Luôn cấu hình `doNotFake: ['nextTick', 'setImmediate']` để không làm đóng băng microtask queue của React Native và `waitFor`/`findBy*`.
- Nếu component dùng `useEffect` kết hợp `setTimeout` để đếm ngược từng giây (countdown), phải tua timer theo từng bước trong vòng lặp bọc bởi `React.act`, không tua gộp 1 lần.

- **ĐÚNG:**
  ```tsx
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  render(<MyComponent/>);

  for (let i = 0; i < 60; i++) {
    React.act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
  jest.useRealTimers();
  ```

### 3. Selector nguyên tử (Atomic Selectors) cho Zustand
Không trả về object hoặc array mới bên trong selector của Zustand nếu không dùng `useShallow`, vì sẽ gây lỗi re-render vô hạn khi chạy test.

- **SAI:** `const { email, token } = useStore((s) => ({ email: s.email, token: s.token }));`
- **ĐÚNG:**
  ```tsx
  const email = useStore((s) => s.email);
  const token = useStore((s) => s.token);
  ```

### 4. Dọn dẹp (Cleanup) bắt buộc sau mỗi bài test
Mọi file test có sử dụng timer, mock hoặc Zustand store phải có khối `afterEach` chuẩn:
```tsx
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
```

---

## 4. Vệ sinh Dữ liệu Giả & Code (Test Data & Code Hygiene)

- **Xóa sạch dữ liệu giả sau khi thử nghiệm**:
  - Trong quá trình phát triển hoặc debug, nếu bạn tạo ra bất kỳ dữ liệu giả (hardcoded credentials, dummy tokens, mock arrays, đoạn code bypass xác thực, file script nháp, hoặc `console.log`), bạn **bắt buộc phải xóa sạch 100%** ngay sau khi kiểm tra xong.
  - Tuyệt đối không để lọt bất kỳ dữ liệu giả hoặc code phục vụ debug nào vào source code chính thức.
- **Dọn dẹp Database sau khi chạy Test**:
  - Mọi dữ liệu giả sinh ra trong quá trình chạy Integration/E2E Test phải được xóa sạch trong `afterEach` hoặc `afterAll` (hoặc bọc trong transaction rollback) để giữ môi trường sạch sẽ.
- **Tối giản dữ liệu Mock trong file Test**:
  - Chỉ khai báo các trường dữ liệu tối thiểu cần thiết cho kịch bản đang test.
  - Xóa bỏ ngay mọi biến mock, helper, fixture, hoặc câu lệnh `import` không còn được sử dụng sau khi sửa code.

---

## 5. Bảo mật & Quản lý Trạng thái (Security & State Hygiene)

- **Nguyên tắc Đặc quyền Tối thiểu (Least Privilege)**: Khi cấu hình route, quyền truy cập hoặc validation, luôn mặc định chặn (deny by default), ưu tiên khớp chính xác (`exact match`) và giới hạn rõ phương thức (HTTP methods) được phép.
- **Zero-Trust với Dữ liệu Đầu vào**: Không tin tưởng các metadata nội bộ do client gửi lên; luôn xóa hoặc ghi đè các internal headers tại tầng cổng giao tiếp.
- **Xác thực Client IP Đáng tin cậy (Trusted Proxy & IP Spoofing Protection - P0)**:
  - Khi triển khai Rate Limiting, Geo-blocking hoặc Audit Log theo Client IP: **Tuyệt đối không đọc trực tiếp header `X-Forwarded-For`** do client gửi lên vì rất dễ bị giả mạo (spoofing).
  - Bắt buộc lấy IP qua cơ chế `trust proxy` tin cậy của framework (NestJS/Express/Fastify) hoặc từ reverse proxy / API Gateway được cấu hình bảo mật (Cloudflare `CF-Connecting-IP`, AWS ALB...).
- **Chống Race Condition trong các luồng nhạy cảm (Concurrency Safety - P0)**:
  - Các luồng nhạy cảm (tạo/xác minh OTP reset mật khẩu, thanh toán, trừ số dư/kho, đổi trạng thái đơn hàng) bắt buộc phải phòng ngừa race condition (khi người dùng spam clicks hoặc gửi concurrent requests song song):
    - Sử dụng Database Transaction với isolation level phù hợp,
    - Unique Constraints / Idempotency Key ở tầng Database,
    - Hoặc Distributed Lock (Redis Lock) / Atomic Conditional Updates (`UPDATE ... WHERE status = 'PENDING'`).
    - Cấm tuyệt đối mô hình "Check-then-Act" không an toàn (đọc dữ liệu ra kiểm tra rồi mới update tuần tự mà không có khóa/transaction bảo vệ).
- **Chống Timing Side-Channel Attack & Đẩy I/O vào Message Queue (P1)**:
  - **Chống lộ thông tin người dùng (Account Enumeration qua Timing Attack)**: Trong các luồng reset mật khẩu, đăng ký, đăng nhập... thời gian phản hồi phải đồng nhất (constant response time), không để kẻ tấn công dựa vào độ trễ phản hồi để suy đoán tài khoản/email có tồn tại trong hệ thống hay không.
  - **Tách I/O nặng sang Message Queue**: Các tác vụ gửi email, SMS, thông báo đẩy tuyệt đối không xử lý đồng bộ (blocking I/O) trong luồng HTTP request. Bắt buộc đẩy vào **Message Queue / Job Queue** (BullMQ, RabbitMQ, SQS...) để xử lý nền và trả về response tức thì.
- **Dọn dẹp Trạng thái Nhạy cảm**: Các dữ liệu tạm thời trên Client/Mobile (như mã xác thực, token tạm, dữ liệu form nhạy cảm) chỉ được lưu trong bộ nhớ tạm (RAM) và phải được xóa (`clear/reset`) ngay khi kết thúc luồng.

---

## 6. Quy trình Tự Kiểm tra Bắt buộc trước khi Hoàn tất (Pre-Completion Checklist)

Trước khi kết thúc câu trả lời cho bất kỳ yêu cầu thay đổi code nào, bạn BẮT BUỘC phải thực hiện tuần tự các bước sau:

1. **Rà soát kiến trúc & phạm vi (Scope & Architecture Check)**:
   - Tuân thủ SRP & DIP: Service điều phối (Orchestrator) không ôm chi tiết cấp thấp; tách logic hashing/crypto sang adapter; tách truy vấn sang repository khi độ phức tạp tăng; không phụ thuộc trực tiếp vào concrete ORM implementation.
   - Đảm bảo an toàn luồng nhạy cảm: Có cơ chế chống race condition (P0), trích xuất IP tin cậy (P0), đẩy email/notification sang queue tránh timing attack (P1).
   - Đảm bảo không tự ý chỉnh sửa hoặc xóa các file cấu hình hệ thống, tài liệu, hoặc file không liên quan đến yêu cầu.
2. **Dọn dẹp & Rà soát Code (Cleanup Check)**:
   - Xóa toàn bộ dữ liệu giả tạm thời, `console.log`, code bị comment, imports thừa và các file nháp sinh ra trong lúc test.
   - Rà soát triệt để không để lọt **Magic Numbers / Magic Strings** trong luồng logic và cả trong các object payload/DTO/claims (bắt buộc tìm kiếm và `import` từ các `const`/`enum` có sẵn như `TokenType`, `UserRole`, `HttpStatus`...).
3. **Chạy Kiểm thử & Linter (Verification)**:
   - Chạy bộ test liên quan -> Đảm bảo **100% PASS**.
   - Chạy trình kiểm tra lỗi cú pháp/typecheck/linter -> Đảm bảo **0 errors**.
4. **Đồng bộ Git (Git Hygiene)**:
   - Chạy `git status` để kiểm tra các file mới tạo hoặc bị xóa.
   - Đảm bảo các file mới hợp lệ đều đã được đưa vào diện theo dõi của Git (staged hoặc intent-to-add) và không còn file rác ở trạng thái untracked.