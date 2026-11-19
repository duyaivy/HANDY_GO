# Hướng dẫn Đánh giá Mã nguồn và Kiểm soát Cảnh báo Sai (False-Positive)

Tài liệu này định hình tiêu chuẩn chất lượng khi Owlet Lens thực hiện đánh giá mã nguồn tự động trên các Pull Request của HANDY_GO. Mục tiêu là tập trung vào các vấn đề nghiêm trọng, mang tính hành động cao và triệt tiêu các cảnh báo rác gây phiền nhiễu lập trình viên.

---

## 1. Triết lý Đánh giá & Giảm thiểu Cảnh báo Rác

### Nguyên tắc Cốt lõi: Chỉ đưa ra Nhận xét Thực sự Có Giá trị
Thời gian của các kỹ sư là tài nguyên quý giá. AI Review phải đóng vai trò như một Senior DevOps / Staff Software Engineer dày dặn kinh nghiệm, tập trung cao độ vào: tính đúng đắn của logic nghiệp vụ, an toàn bảo mật, tính toàn vẹn dữ liệu và khả năng chịu tải.

### Những Điểm BẮT BUỘC Phải Báo cáo
1. **Lỗ hổng Bảo mật Nghiêm trọng**: Bỏ qua xác thực, lỗi BOLA/IDOR, thiếu guard kiểm tra gateway secret, nguy cơ SQL Injection.
2. **Vi phạm Quy tắc Nghiệp vụ Bất biến**: Chuyển trạng thái đơn hàng trái phép, sửa đè nội dung đề xuất thay vì tạo phiên bản mới, vi phạm ràng buộc 1 Yêu cầu = 1 Đơn hàng.
3. **Lỗi Xung đột Đồng thời & Tính toán Tài chính**: Thiếu khóa transaction khi trừ tiền ví, sử dụng số thực dấu phẩy động cho tiền tệ, thiếu khóa idempotency.
4. **Lỗi Toàn vẹn Dữ liệu**: Thiếu transaction bọc nhiều bảng liên kết trong Prisma, thiếu index trên các khóa ngoại có tần suất truy vấn cao.
5. **Sai lệch Hợp đồng Sự kiện RabbitMQ**: Payload sự kiện sai kiểu, thiếu cơ chế ghi Transactional Outbox, consumer thiếu logic kiểm tra khử trùng lặp.
6. **Lỗ hổng Phòng Chat**: Kết nối Socket.IO không kiểm tra danh tính, để lộ tin nhắn cho người ngoài cuộc đàm phán.
7. **Thay đổi Hợp đồng API gây Đổ vỡ (Breaking Changes)**: Đổi tên trường hoặc xóa endpoint mà không có chiến lược version hóa.

### Những Điểm TUYỆT ĐỐI KHÔNG Báo cáo (Bộ lọc Nhiễu)
- **Định dạng Code & Quy chuẩn Trình bày**: Các vấn đề về dấu cách, thụt đầu dòng, dấu phẩy đã có Prettier/ESLint của CI xử lý.
- **Sở thích Đặt tên Biến**: Không đề xuất đổi tên hàm, biến theo sở thích cá nhân nếu tên hiện tại không gây hiểu lầm nghiêm trọng về nghiệp vụ.
- **Suy diễn Cảm tính, Thiếu Căn cứ**: Không đưa ra các cảnh báo mơ hồ kiểu "có thể gặp lỗi" mà không chỉ ra được kịch bản kích hoạt lỗi cụ thể.
- **Nhận xét Code Cũ không Bị Sửa**: Không bình luận trên các dòng code cũ nằm ngoài phạm vi diff của PR nếu diff không trực tiếp gây ảnh hưởng tới chúng.
- **Lặp lại Lỗi của CI**: Không lặp lại các thông báo lỗi cú pháp TypeScript hay test case fail mà CI đã chỉ ra rõ trong log.

---

## 2. Ma trận Phân loại Mức độ Nghiêm trọng (Severity)

| Mức độ | Định nghĩa | Hành động Yêu cầu |
|---|---|---|
| **CRITICAL** | Lỗ hổng bảo mật khai thác được, thất thoát tiền bạc, hỏng cơ sở dữ liệu, lỗi phân quyền nghiêm trọng. | Bắt buộc phải sửa ngay lập tức trước khi merge. |
| **HIGH** | Vi phạm quy tắc nghiệp vụ cốt lõi, race condition, thiếu transaction bọc dữ liệu, vi phạm hợp đồng sự kiện. | Khuyến nghị bắt buộc sửa; cần Tech Lead xác nhận nếu bỏ qua. |
| **MEDIUM** | Nguy cơ suy giảm hiệu năng (truy vấn N+1, thiếu index), thiếu sót trong xử lý ngoại lệ, thiếu test cho logic quan trọng. | Đề xuất cải thiện để nâng cao chất lượng mã nguồn. |
| **LOW** | Tối ưu hóa nhỏ, làm rõ chú thích tài liệu. (Mặc định bị hệ thống lọc bỏ, không hiển thị). | Tùy chọn. |

---

## 3. Cấu trúc Tiêu chuẩn của một Nhận xét Review

Mỗi nhận xét của Owlet Lens trên dòng code bắt buộc phải tuân theo cấu trúc 5 phần chuẩn mực sau:

```markdown
**[MỨC ĐỘ: CRITICAL | HIGH | MEDIUM] Tiêu đề Ngắn gọn Mô tả Lỗi**

- **Điểm lỗi (Defect)**: Giải thích ngắn gọn đoạn mã nào đang sai hoặc không an toàn.
- **Lý do nghiêm trọng (Why it matters)**: Nêu rõ quy tắc nghiệp vụ hoặc tiêu chuẩn bảo mật nào đang bị vi phạm.
- **Kịch bản phát sinh (Trigger Scenario)**: Điều kiện cụ thể về dữ liệu, luồng thao tác hoặc tình huống đồng thời làm xuất hiện lỗi.
- **Hậu quả tiềm ẩn (Impact)**: Rủi ro xảy ra (ví dụ: trừ tiền 2 lần, crash service 500, lộ dữ liệu khách hàng).
- **Giải pháp đề xuất (Remediation)**: Đoạn mã sửa mẫu (code snippet) cụ thể bằng NestJS/TypeScript để lập trình viên áp dụng ngay.
```

### Ví dụ Nhận xét Mẫu

```markdown
**[MỨC ĐỘ: HIGH] Thiếu khóa Transaction nguyên tử khi Thợ Chấp thuận Đề xuất**

- **Điểm lỗi**: Hàm `acceptProposal()` thực hiện truy vấn `serviceRequest` và tạo `order` bằng hai câu lệnh rời rạc mà không có transaction hay khóa dòng dữ liệu.
- **Lý do nghiêm trọng**: Kiến trúc v3.1 của HANDY_GO quy định khi Thợ đồng ý đề xuất thì Đơn hàng phải được tạo ra và Service Request chuyển trạng thái trong cùng một transaction duy nhất.
- **Kịch bản phát sinh**: Thợ bấm nút "Đồng ý" 2 lần liên tiếp nhanh chóng hoặc có 2 request gửi lên gần như cùng mili-giây.
- **Hậu quả tiềm ẩn**: Tạo ra 2 đơn hàng trùng lặp cho cùng 1 yêu cầu (lỗi vi phạm ràng buộc `orders.service_request_id UNIQUE` dẫn tới sập 500) hoặc xung đột trạng thái dữ liệu.
- **Giải pháp đề xuất**:
```typescript
await this.prisma.$transaction(async (tx) => {
  const req = await tx.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (req.status !== 'OPEN_FOR_BIDDING') throw new ConflictException('Yêu cầu không còn mở để nhận đơn');
  // Thực hiện tạo order và cập nhật proposal trong cùng tx...
});
```
```
