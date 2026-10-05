Bạn đang làm việc trong một backend NestJS monorepo hiện có.

NHIỆM VỤ:
Triển khai module dùng chung để upload Image và Big Video bằng Cloudinary.

QUAN TRỌNG:
Trước khi code, hãy đọc kỹ cấu trúc repository hiện tại và bám sát convention đang có:
- NestJS monorepo
- apps/api-gateway
- các apps microservice khác
- libs/common
- libs/config
- libs/database
- libs/logger
- libs/rabbitmq
- libs/redis
- các path alias hiện tại
- cách project đang khai báo module/provider/config/env/DTO/Swagger
- package manager và coding convention hiện có

Không tự ý thay đổi architecture chung của project nếu không cần thiết.

==================================================
I. SCOPE CỦA TASK
==================================================

Chỉ triển khai đúng 2 flow:

1. IMAGE:
FE/Mobile
  -> API Gateway
  -> libs/cloudinary
  -> Cloudinary

Ảnh nhỏ đi tuần tự qua backend.

2. BIG VIDEO:
FE/Mobile
  -> Backend xin thông tin signed upload
  -> Backend trả signature + upload config
  -> FE/Mobile upload video TRỰC TIẾP lên Cloudinary bằng chunked upload

Video tuyệt đối KHÔNG đi qua API Gateway/backend.

Không triển khai:
- media-service riêng
- database Media
- lifecycle
- webhook
- cronjob
- auto cleanup
- orphan cleanup
- RabbitMQ event
- delete media
- unit test
- integration test
- e2e test

Chỉ tập trung vào upload image + chuẩn bị direct chunk upload cho big video.

==================================================
II. KIẾN TRÚC MONG MUỐN
==================================================

Cloudinary integration phải nằm trong shared lib, ví dụ:

libs/
└── cloudinary/
    └── src/
        ├── cloudinary.module.ts
        ├── cloudinary.service.ts
        ├── cloudinary.provider.ts
        ├── cloudinary.constants.ts
        ├── dto/
        ├── interfaces/
        └── index.ts

Tên file/folder có thể điều chỉnh nếu repository hiện tại có convention khác.

NGUYÊN TẮC:

- Toàn bộ code gọi Cloudinary SDK phải nằm trong libs/cloudinary.
- API Gateway controller phải mỏng.
- API Gateway không chứa Cloudinary business/infrastructure logic.
- Lib phải reusable để sau này catalog-service, order-service,
  user-service hoặc service khác đều có thể import.
- Không tạo logic phụ thuộc vào Product, Order, User...
- Lib Cloudinary phải generic.

Ví dụ:

CloudinaryService.uploadImage(...)
CloudinaryService.createVideoUploadSignature(...)

KHÔNG làm:

CloudinaryService.uploadProductImage(...)
CloudinaryService.uploadOrderVideo(...)

==================================================
III. CLOUDINARY CONFIGURATION
==================================================

Dùng package Cloudinary Node SDK chính thức.

Nếu package chưa có:
- thêm dependency bằng package manager hiện tại của project
- không thay đổi package manager

Cloudinary config phải lấy từ environment variables.

Ít nhất:

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

Có thể thêm nếu hợp lý:

CLOUDINARY_IMAGE_FOLDER=
CLOUDINARY_VIDEO_FOLDER=
CLOUDINARY_IMAGE_MAX_SIZE_MB=
CLOUDINARY_VIDEO_MAX_SIZE_MB=
CLOUDINARY_VIDEO_CHUNK_SIZE_MB=

Không hard-code API secret.

API secret tuyệt đối không được return về FE.

Nếu project đang có ConfigModule/config validation riêng thì phải tích hợp
vào hệ thống config hiện tại thay vì tự tạo một kiểu config hoàn toàn khác.

Production code không được fallback sang fake secret.

==================================================
IV. ENDPOINT 1 - UPLOAD IMAGE
==================================================

Expose endpoint thông qua API Gateway.

Ưu tiên route:

POST /uploads/image

hoặc điều chỉnh prefix sao cho phù hợp với convention route hiện có.

Content-Type:

multipart/form-data

Field:

file

Swagger phải có upload file selector.

Flow:

Swagger / FE
    |
    | multipart image
    v
API Gateway Controller
    |
    v
CloudinaryService
    |
    v
Cloudinary

Backend nhận image và upload Cloudinary bằng stream.

Ưu tiên dùng:

cloudinary.uploader.upload_stream(...)

Không convert ảnh thành base64.

Không ghi temporary file xuống disk nếu không cần thiết.

Validate:

- bắt buộc có file
- MIME type chỉ cho phép image
- giới hạn file size
- rejected MIME type phải trả lỗi rõ ràng
- empty file phải reject

Các MIME type hợp lý có thể hỗ trợ:

image/jpeg
image/png
image/webp

Nếu repository đã có validation/filter/error format thì phải reuse.

Folder Cloudinary phải do backend kiểm soát.

Không cho client tùy ý truyền:

folder="../../..."
public_id nguy hiểm
resource_type tùy ý

Response cần normalize, không return nguyên object khổng lồ của Cloudinary.

Ví dụ response:

{
  "assetId": "...",
  "publicId": "...",
  "url": "https://...",
  "resourceType": "image",
  "format": "webp",
  "width": 1200,
  "height": 800,
  "bytes": 123456
}

Tên secureUrl/url phải theo convention response hiện có của project.

==================================================
V. ENDPOINT 2 - PREPARE BIG VIDEO DIRECT UPLOAD
==================================================

KHÔNG tạo endpoint nhận file video.

Tạo endpoint kiểu:

POST /uploads/video/init

hoặc:

POST /uploads/video/signature

Chọn tên phù hợp nhất với naming convention hiện tại.

Endpoint chỉ nhận metadata.

Ví dụ request:

{
  "fileName": "demo.mp4",
  "fileSize": 734003200,
  "mimeType": "video/mp4",
  "checksumSha256": "optional-64-char-hex"
}

checksumSha256 là OPTIONAL.

Nếu truyền checksum:
- validate format SHA-256 hexadecimal 64 ký tự
- KHÔNG tuyên bố backend đã verify nội dung file
- backend không nhận bytes video nên không thể tự tính checksum toàn file
- field này hiện tại chỉ dùng làm client-side integrity metadata /
  correlation nếu cần sau này

Validate:

- fileName không rỗng
- fileSize > 0
- fileSize <= configured maximum
- chỉ chấp nhận video MIME types đã whitelist
- tuyệt đối không dựa chỉ vào extension để quyết định
- validate checksum nếu có

Ví dụ MIME whitelist:

video/mp4
video/quicktime
video/webm

Nếu codebase có enum/constants phù hợp thì sử dụng.

==================================================
VI. SIGNED DIRECT UPLOAD
==================================================

Backend dùng Cloudinary SDK để generate signed upload parameters.

Dùng SHA-256 cho authentication signature nếu Cloudinary SDK/config hiện tại hỗ trợ.

LƯU Ý:

Authentication SHA-256 signature của Cloudinary KHÔNG phải file checksum.

Không được nhầm 2 khái niệm.

Backend tạo:

- timestamp
- signature
- publicId hoặc upload identifier hợp lệ
- folder
- resource_type = video

Có thể generate UUID cho upload.

Ví dụ:

const uploadId = crypto.randomUUID()

Có thể dùng uploadId để FE/Mobile sử dụng cho:

X-Unique-Upload-Id

Public ID nên do backend sinh ra để tránh client tùy ý đặt tên asset.

Ví dụ dạng:

videos/<uuid>

hoặc cấu trúc folder tương ứng với Cloudinary config hiện tại.

==================================================
VII. RESPONSE CHO VIDEO INIT
==================================================

Endpoint phải trả đủ thông tin để FE hoặc Mobile có thể trực tiếp
upload chunks lên Cloudinary mà KHÔNG cần gọi backend cho từng chunk.

Response mong muốn gần tương tự:

{
  "uploadId": "uuid",
  "cloudName": "...",
  "apiKey": "...",
  "timestamp": 1234567890,
  "signature": "...",
  "publicId": "...",
  "folder": "...",
  "resourceType": "video",
  "uploadUrl": "https://api.cloudinary.com/v1_1/<cloudName>/video/upload",
  "chunkSize": 20971520
}

API key có thể public.

API secret TUYỆT ĐỐI không return.

Signature chỉ ký đúng các parameter mà FE/Mobile sẽ gửi lên Cloudinary.

Không ký field rồi sau đó response cho FE một giá trị khác.

==================================================
VIII. CHUNKED VIDEO PROTOCOL
==================================================

Thiết kế response/API documentation để FE và Mobile upload trực tiếp theo
manual chunk upload protocol của Cloudinary.

Client phải dùng cùng một:

X-Unique-Upload-Id: <uploadId>

cho toàn bộ chunks của một video.

Mỗi request chunk phải có:

Content-Range: bytes <start>-<end>/<total>

Ví dụ:

Chunk 1:

X-Unique-Upload-Id: abc-123
Content-Range: bytes 0-20971519/734003200

Chunk 2:

X-Unique-Upload-Id: abc-123
Content-Range: bytes 20971520-41943039/734003200

...

Chunk cuối gửi đúng total size.

Chunk size mặc định:

20 MB

nhưng đưa thành config.

Cloudinary yêu cầu chunk phải lớn hơn 5 MB ngoại trừ chunk cuối,
do đó config phải validate giá trị hợp lệ.

Không cho cấu hình chunk size <= 5 MB.

FE/Mobile gửi từng chunk trực tiếp tới:

https://api.cloudinary.com/v1_1/<cloudName>/video/upload

Mỗi chunk phải sử dụng các upload parameters Cloudinary yêu cầu
cho signed upload.

Phải dùng cùng uploadId cho toàn bộ upload session.

Cloudinary intermediate response có thể trả:

done: false

và final response:

done: true

Backend không tham gia vào từng chunk.

==================================================
IX. RETRY / RESUME DESIGN
==================================================

Backend không cần implement uploader client.

Nhưng API response và Swagger description phải được thiết kế để FE/Mobile
có thể implement retry.

Document rõ:

- mỗi video có một uploadId
- retry một chunk phải giữ nguyên uploadId
- Content-Range phải đúng
- chunk upload thất bại thì retry chunk đó
- không tạo signature mới cho từng chunk trừ khi signature hết hạn
- Cloudinary signed upload timestamp có thời hạn, vì vậy khi hết hạn
  client phải gọi lại endpoint init/signature

Không viết frontend code trong backend repository nếu repository hiện tại
không chứa frontend.

Có thể thêm Swagger description/example để frontend team dễ hiểu.

==================================================
X. CHECKSUM
==================================================

Yêu cầu phải xử lý khái niệm checksum đúng kỹ thuật.

Không tự sáng tạo một Cloudinary checksum header nếu official API
không hỗ trợ nó.

Không được coi Cloudinary authentication signature là checksum của video.

Backend không nhận file video nên backend không thể:

crypto.createHash('sha256').update(videoBytes)

vì videoBytes không đi qua backend.

Do đó:

- checksumSha256 trong request chỉ là optional client-provided metadata
- validate format nếu có
- không log rằng checksum đã được verified
- không return verified: true
- không tạo security assumption dựa vào checksum này

Nếu Cloudinary SDK/API version hiện tại cung cấp một cơ chế checksum
chính thức cho chunk upload, hãy sử dụng CHỈ khi xác nhận được từ API/type
của package hiện tại.

Không đoán API.

==================================================
XI. SECURITY
==================================================

Phải đảm bảo:

1. CLOUDINARY_API_SECRET chỉ tồn tại backend.
2. Không log secret.
3. Không return secret qua API.
4. Client không tự chọn arbitrary folder.
5. Client không tự chọn resource_type.
6. Backend whitelist video MIME type.
7. Backend validate image MIME type.
8. Backend validate max size.
9. Signature chỉ chứa parameter cần thiết.
10. publicId do backend generate.
11. Timestamp sử dụng Unix timestamp đúng chuẩn Cloudinary.
12. Không dùng unsigned upload preset cho video nếu đã thiết kế signed flow.
13. Không tạo API public nguy hiểm cho phép ký arbitrary Cloudinary params.

Đặc biệt KHÔNG tạo endpoint kiểu:

POST /cloudinary/sign

{
  "params": {...anything client wants...}
}

vì client có thể dùng backend như một signing oracle.

Endpoint video init phải chỉ nhận whitelist metadata:

fileName
fileSize
mimeType
checksumSha256?

Sau đó backend tự quyết định toàn bộ Cloudinary upload parameters.

==================================================
XII. SWAGGER
==================================================

Swagger phải hiển thị được cả hai endpoint.

IMAGE:

POST /uploads/image

Swagger:
- multipart/form-data
- file input
- mô tả max size
- response example
- errors

VIDEO:

POST /uploads/video/init

Swagger request example:

{
  "fileName": "movie.mp4",
  "fileSize": 734003200,
  "mimeType": "video/mp4",
  "checksumSha256": "..."
}

Swagger response example phải cho FE biết:

- uploadId
- uploadUrl
- chunkSize
- apiKey
- cloudName
- timestamp
- signature
- publicId
- resourceType

Swagger description của video endpoint phải nói rõ:

THIS ENDPOINT DOES NOT UPLOAD VIDEO DATA.

FE/Mobile must upload video chunks directly to Cloudinary.

Có thể mô tả flow:

1. Call POST /uploads/video/init
2. Receive signed configuration
3. Split local file into chunks
4. POST each chunk directly to Cloudinary
5. Same X-Unique-Upload-Id for all chunks
6. Use Content-Range for each chunk
7. Final Cloudinary response contains done=true

==================================================
XIII. ERROR HANDLING
==================================================

Bám theo global exception/error format đang có trong project.

Không tạo một error schema hoàn toàn khác.

Các case tối thiểu:

IMAGE:

- missing file
- unsupported image MIME
- image too large
- Cloudinary upload error

VIDEO INIT:

- invalid file name
- invalid file size
- too large
- unsupported MIME
- invalid SHA256 format
- missing Cloudinary configuration

Không leak:

apiSecret
Cloudinary internal stack trace
sensitive environment values

==================================================
XIV. CLOUDINARY LIB PUBLIC API
==================================================

CloudinaryService nên expose tối thiểu API tương tự:

uploadImage(...)

createVideoUploadSignature(...)

Tên method có thể điều chỉnh theo style repository.

Không expose Cloudinary SDK object trực tiếp ra controller.

Ví dụ controller không được làm:

cloudinary.v2.uploader...

Controller chỉ được gọi:

this.cloudinaryService.uploadImage(...)

hoặc:

this.cloudinaryService.createVideoUploadSignature(...)

==================================================
XV. CODE QUALITY
==================================================

Yêu cầu:

- TypeScript strict-friendly
- không dùng any nếu không thực sự cần
- dùng official Cloudinary TypeScript types khi hợp lý
- constructor injection theo NestJS
- reusable module
- tránh duplicated config
- tránh magic numbers
- constants/config cho size
- không console.log
- dùng logger convention hiện tại nếu cần
- không over-engineering
- không thêm abstraction vô nghĩa
- không thêm repository/database
- không thêm event bus
- không thêm lifecycle

Nếu project đang dùng ESM và import có .js thì phải follow đúng convention đó.

Nếu project đang dùng pnpm workspace thì dùng pnpm.

==================================================
XVI. KHÔNG VIẾT TEST
==================================================

Task này KHÔNG yêu cầu:

*.spec.ts
unit test
integration test
e2e test

Không tạo test.

Thay vào đó sau khi code:

- chạy lint nếu project có
- chạy typecheck/build phù hợp
- đảm bảo api-gateway build thành công
- đảm bảo import libs/cloudinary resolve thành công

Không sửa lỗi unrelated toàn project nếu không liên quan đến task.

==================================================
XVII. ENV EXAMPLE
==================================================

Nếu project có:

.env.example

hãy cập nhật các Cloudinary variables cần thiết.

Không ghi API secret thật.

Ví dụ:

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

CLOUDINARY_IMAGE_FOLDER=handy-go/images
CLOUDINARY_VIDEO_FOLDER=handy-go/videos

CLOUDINARY_IMAGE_MAX_SIZE_MB=10
CLOUDINARY_VIDEO_MAX_SIZE_MB=2048
CLOUDINARY_VIDEO_CHUNK_SIZE_MB=20

Nếu project đã có cách naming env khác thì follow convention đó.

==================================================
XVIII. TRÌNH TỰ THỰC HIỆN
==================================================

Hãy làm theo thứ tự:

STEP 1:
Đọc repository.

Tìm:
- api-gateway main module
- controller pattern
- Swagger setup
- config pattern
- existing shared libs
- error handling
- DTO validation
- tsconfig path aliases
- package.json
- nest-cli.json

STEP 2:
Nói ngắn gọn architecture hiện tại bạn tìm thấy và liệt kê file dự định
tạo/sửa.

Không hỏi tôi các câu hỏi không cần thiết nếu có thể suy luận trực tiếp
từ codebase.

STEP 3:
Tạo libs/cloudinary theo convention hiện có.

STEP 4:
Implement Cloudinary configuration/provider.

STEP 5:
Implement sequential image upload.

STEP 6:
Implement signed big-video init.

STEP 7:
Expose hai endpoint qua API Gateway.

STEP 8:
Add Swagger documentation.

STEP 9:
Update env example/config validation nếu cần.

STEP 10:
Build/typecheck/lint.

STEP 11:
Review git diff và loại bỏ code thừa.

==================================================
XIX. ACCEPTANCE CRITERIA
==================================================

Task chỉ được coi là hoàn thành khi:

[ ] Có reusable libs/cloudinary

[ ] API Gateway import và sử dụng lib

[ ] POST /uploads/image nhận multipart image

[ ] Image được upload backend -> Cloudinary

[ ] Không dùng base64

[ ] Response image được normalize

[ ] POST /uploads/video/init KHÔNG nhận video bytes

[ ] Backend generate signed Cloudinary upload parameters

[ ] API secret không bao giờ gửi về client

[ ] Video response có uploadId

[ ] Video response có uploadUrl

[ ] Video response có chunkSize

[ ] Video response có Content-Range/X-Unique-Upload-Id instructions
    trong Swagger documentation

[ ] FE/Mobile có thể dùng response để upload trực tiếp Cloudinary

[ ] Chunk size config mặc định khoảng 20 MB

[ ] Không giả vờ verify checksum khi backend không có file bytes

[ ] checksumSha256 optional được validate đúng format nếu được truyền

[ ] Không có DB code

[ ] Không có lifecycle

[ ] Không có webhook

[ ] Không có cron

[ ] Không có cleanup

[ ] Không có media-service mới

[ ] Không có unit test

[ ] Build/typecheck thành công

==================================================
XX. OUTPUT CUỐI CÙNG
==================================================

Sau khi hoàn thành code, trả lời tôi theo format:

1. Files created
2. Files modified
3. Architecture implemented
4. API endpoints
5. Environment variables required
6. How image upload works
7. How FE/Mobile big-video upload works
8. Example curl for POST /uploads/image
9. Example curl for POST /uploads/video/init
10. Example pseudo-code cho FE chunk upload
11. Build/typecheck result
12. Những phần cố tình CHƯA triển khai:
    - lifecycle
    - DB
    - webhook
    - cleanup
    - cron
    - tests

Không tự mở rộng scope ngoài yêu cầu.