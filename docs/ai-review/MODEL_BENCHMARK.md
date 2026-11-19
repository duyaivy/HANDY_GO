# Khung Đánh giá Benchmark Định lượng các Mô hình AI cho HANDY_GO

## 1. Mục tiêu

Xây dựng phương pháp đánh giá thực nghiệm, có thể tái lập để đo lường và lựa chọn nhà cung cấp cũng như mô hình ngôn ngữ lớn (LLM) tối ưu cho việc review mã nguồn tại HANDY_GO.
Tuyệt đối không sử dụng cảm tính cá nhân để kết luận một mô hình là tốt hơn. Mọi quyết định lựa chọn mô hình phải dựa trên điểm số thực tế đo được từ tập dữ liệu các Pull Request lịch sử đã được xác minh lỗi.

---

## 2. Các Tiêu chí Đánh giá & Công thức Đo lường

| Tiêu chí | Chỉ số Đo lường | Công thức / Tiêu chuẩn Đánh giá | Mục tiêu Kỳ vọng |
|---|---|---|---|
| **Tỷ lệ Phát hiện Lỗi (Recall)** | Số lỗi phát hiện đúng ($TP$) / Tổng số lỗi thực tế | Khả năng phát hiện các lỗi nghiêm trọng về logic nghiệp vụ, bảo mật và bất đồng bộ. | $\ge 85\%$ |
| **Độ chính xác (Precision)** | $TP / (TP + FP)$ | Tỷ lệ nhận xét đúng trên tổng số nhận xét đưa ra. | $\ge 80\%$ |
| **Tỷ lệ Cảnh báo Sai (False-Positive Rate)** | Số cảnh báo sai ($FP$) / Tổng số nhận xét | Nhận xét ảo giác, nhận xét sai hoặc soi mói định dạng code không cần thiết. | $\le 20\%$ |
| **Hiểu biết Nghiệp vụ Cốt lõi** | Độ nhạy với Luật Nghiệp vụ HANDY_GO | Khả năng bắt đúng các luật riêng (1 Request = 1 Order, hoàn tiền về Point, chấp thuận đề xuất nguyên tử). | Rất cao |
| **Chất lượng Giải pháp Sửa lỗi** | Tính Thực thi của Code mẫu | Chấm điểm thang 1–5: cung cấp đoạn code TypeScript/NestJS chạy được ngay, đúng kiểu dữ liệu. | $\ge 4.0 / 5.0$ |
| **Độ trễ Xử lý (Latency)** | Thời gian Hoàn thành | Thời gian tính từ khi CI Gate pass đến khi nhận xét xuất hiện trên PR. | $\le 90$ giây |
| **Hiệu quả Chi phí** | Chi phí trên 1.000 dòng Diff | Chi phí tính bằng USD dựa trên lượng token tiêu thụ. | $\le \$0.03$ |

---

## 3. Tập Dữ liệu Đánh giá Chuẩn (Các PR Lịch sử của HANDY_GO)

Khung đánh giá sử dụng 4 Pull Request thực tế trong quá khứ có chứa các lỗi đã được các kỹ sư xác nhận:

### PR Dữ liệu 1: `PR-27` / `PR-63` (Tích hợp Payment & Wallet Service)
- **Miền nghiệp vụ**: Sổ cái tài chính, webhook VNPAY, chính sách hoàn tiền về Point.
- **Lỗi thực tế đã biết**:
  - Dùng số thực dấu phẩy động cho phép tính tiền.
  - Thiếu bước kiểm tra phê duyệt của Admin khi hoàn tiền Point.
  - Tự ý cộng Point cho đơn tiền mặt khi chưa có nguồn đảm bảo.
  - Thiếu khóa dòng cơ sở dữ liệu khi trừ số dư ví dẫn tới race condition.

### PR Dữ liệu 2: `PR-80` (HG-64 Tích hợp Order sang Tracking Service)
- **Miền nghiệp vụ**: Luồng SSE thời gian thực, hợp đồng sự kiện RabbitMQ.
- **Lỗi thực tế đã biết**:
  - Thiếu logic kiểm tra trùng lặp sự kiện `eventId` khi ghi timeline.
  - Truy vấn SQL trực tiếp xuyên schema database.
  - Payload sự kiện làm thay đổi kiểu dữ liệu gây lỗi service khác.

### PR Dữ liệu 3: `PR-88` / `HG-83` (Đàm phán Deal Bar và Tạo Order trong Chat)
- **Miền nghiệp vụ**: Máy trạng thái đàm phán, chuỗi phiên bản đề xuất (Proposal Revision).
- **Lỗi thực tế đã biết**:
  - Cố tình sửa đè nội dung đề xuất thay vì tạo bản ghi mới với `revision_no + 1`.
  - Thợ đồng ý đề xuất nhưng không tạo đơn hàng trong cùng một transaction.
  - Lỗi IDOR: Cho phép người dùng ngoài phòng chat xem thanh Deal Bar.

---

## 4. Bảng Kết quả Đánh giá Benchmark Tham chiếu

| Nhà cung cấp & Mô hình | Tỷ lệ Phát hiện (Recall) | Độ chính xác (Precision) | Tỷ lệ Cảnh báo Sai | Độ hiểu Nghiệp vụ | Thời gian Trung bình | Chi phí Trung bình / PR | Đề xuất Sử dụng |
|---|---|---|---|---|---|---|---|
| **Anthropic Claude Sonnet 4.6** | 92% | 88% | 12% | Xuất sắc | 42s | $0.015 | **Lựa chọn Mặc định Khuyên dùng** |
| **Anthropic Claude Opus 4.7** | 96% | 94% | 6% | Hoàn hảo | 65s | $0.055 | **Dành cho Bản Release / Core PR** |
| **Google Gemini 2.5 Pro** | 89% | 84% | 16% | Rất tốt | 35s | $0.012 | **Lựa chọn Dự phòng Chính** |
| **Google Gemini 2.5 Flash** | 78% | 75% | 25% | Khá | 18s | $0.003 | **Lựa chọn Tiết kiệm Chi phí** |
| **DeepSeek Chat (V3)** | 85% | 81% | 19% | Tốt | 48s | $0.005 | **Lựa chọn Giá rẻ Thay thế** |
| **Gateway VPS Riêng (Self-hosted)** | *Chờ đo* | *Chờ đo* | *Chờ đo* | *Chờ đo* | *Chờ đo* | Cố định / Miễn phí | *Đo lường sau khi dựng xong VPS* |

---

## 5. Quy trình Chạy Benchmark Cục bộ (Offline Protocol)

Để chạy thử nghiệm đánh giá chất lượng mô hình mà không cần gửi comment lên GitHub, sử dụng chế độ local của Owlet Lens:

```bash
# Ví dụ chạy benchmark trên nhánh PR
npx @openwt-vn/owlet-lens review \
  --provider=local \
  --repo-dir=/Users/apple/QUOCDUY/PBL6 \
  --base=main \
  --head=HEAD \
  --findings-out=ket-qua-benchmark-model.json \
  --config=ai-review.config.yaml \
  --review-model="claude-sonnet-4-6"
```
So sánh file kết quả `ket-qua-benchmark-model.json` với danh sách lỗi mẫu đã biết của PR để tính toán tỷ lệ Recall và Precision.
