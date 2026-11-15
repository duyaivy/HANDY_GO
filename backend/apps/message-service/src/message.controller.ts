import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  Res,
  Inject,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type {
  ConversationListQuery,
  MessageListQuery,
} from '../../../libs/common/src/message-contracts/index.js';
import { IdentityService } from './identity.js';
import { MessageService } from './message.service.js';
import { ChatError, RateLimits, validateInput } from './security.js';
import {
  ConversationCreateDto,
  ConversationListResponseEnvelopeDto,
  ConversationResponseEnvelopeDto,
  MessageHistoryResponseEnvelopeDto,
  MessageReadDto,
  MessageReadResponseEnvelopeDto,
  ChatErrorEnvelopeDto,
} from './dto/index.js';

@ApiTags('Conversations')
@ApiBearerAuth('JWT-Auth')
@Controller()
export class MessageController {
  constructor(
    @Inject(MessageService) private readonly messages: MessageService,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(RateLimits) private readonly rates: RateLimits,
  ) {}

  private async user(req: Request) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ChatError('UNAUTHORIZED');
    return (await this.identity.authenticate(header.slice(7))).userId;
  }

  private query(query: Record<string, unknown>) {
    if (query.limit !== undefined) {
      if (
        typeof query.limit !== 'string' ||
        !/^(?:[1-9]|[1-9][0-9]|100)$/.test(query.limit)
      )
        throw new ChatError('VALIDATION_ERROR');
      return { ...query, limit: Number(query.limit) };
    }
    return query;
  }

  private envelope(data: unknown, statusCode = 200) {
    return { statusCode, message: 'Success', data };
  }

  @ApiExcludeEndpoint()
  @Get('health')
  async health() {
    await this.messages.db.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'message-service' };
  }

  @Post('api/v1/conversations')
  @ApiOperation({
    summary: 'Tạo hoặc lấy cuộc trò chuyện theo lượt báo giá (bid)',
    description:
      'Khởi tạo cuộc trò chuyện mới hoặc lấy cuộc trò chuyện hiện có giữa khách hàng và thợ dựa trên lượt báo giá hợp lệ (bid). Cho phép tạo hội thoại khi báo giá đang hoạt động (active) trong giai đoạn đấu thầu (open_for_bidding hoặc bidding_closed) mà không bắt buộc khách hàng phải chấp nhận báo giá trước, hoặc khi yêu cầu dịch vụ đã chuyển thành đơn hàng với thợ được chọn. Nếu cuộc trò chuyện đã tồn tại cho cặp yêu cầu - thợ này, API sẽ trả về thông tin cuộc trò chuyện hiện có một cách idempotent (mã 200 thay vì 201).',
  })
  @ApiBody({ type: ConversationCreateDto })
  @ApiResponse({
    status: 201,
    description: 'Cuộc trò chuyện mới được tạo thành công.',
    type: ConversationResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Cuộc trò chuyện đã tồn tại từ trước.',
    type: ConversationResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu đầu vào hoặc định dạng bidId không hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Yêu cầu Bearer JWT token hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Người dùng không đủ điều kiện hoặc không có quyền tham gia hội thoại cho báo giá này.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'Vượt quá giới hạn tần suất tạo hội thoại (tối đa 20 yêu cầu / phút).',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'Dịch vụ phụ thuộc (Bidding/Order/Auth) tạm thời không phản hồi.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi hệ thống nội bộ.',
    type: ChatErrorEnvelopeDto,
  })
  async create(
    @Req() req: Request,
    @Body() body: ConversationCreateDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.user(req);
    this.rates.take(`create:${user}`, 20, 60000);
    const result = await this.messages.create(user, body);
    const status = result.created ? 201 : 200;
    res.status(status);
    return this.envelope(result.conversation, status);
  }

  @Get('api/v1/conversations')
  @ApiOperation({
    summary: 'Lấy danh sách các cuộc trò chuyện của người dùng',
    description:
      'Trả về danh sách các cuộc trò chuyện của người dùng hiện tại (khách hàng hoặc thợ), sắp xếp theo thời gian tin nhắn mới nhất giảm dần. Hỗ trợ phân trang bằng con trỏ keyset (cursor).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Số lượng cuộc trò chuyện tối đa trả về trên mỗi trang (1-100, mặc định: 30).',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description:
      'Con trỏ phân trang dạng opaque HMAC-signed token lấy trực tiếp từ nextCursor của kết quả trước. Không truyền khi lấy trang đầu tiên.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách cuộc trò chuyện phân trang thành công.',
    type: ConversationListResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Tham số limit hoặc cursor không hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Yêu cầu Bearer JWT token hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'Vượt quá giới hạn tần suất yêu cầu (tối đa 120 yêu cầu / phút).',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi hệ thống nội bộ.',
    type: ChatErrorEnvelopeDto,
  })
  async list(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(
      await this.messages.list(
        user,
        this.query(query) as ConversationListQuery,
      ),
    );
  }

  @Get('api/v1/conversations/:id')
  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một cuộc trò chuyện',
    description:
      'Trả về chi tiết một cuộc trò chuyện cùng trạng thái quyền (đọc/gửi) và trạng thái đã đọc của các thành viên. Chỉ thành viên trong cuộc trò chuyện (khách hàng hoặc thợ) mới có quyền truy cập; người ngoài sẽ nhận mã 404.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID định danh duy nhất của cuộc trò chuyện.',
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin chi tiết cuộc trò chuyện.',
    type: ConversationResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 400,
    description: 'ID cuộc trò chuyện không đúng định dạng UUID.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Yêu cầu Bearer JWT token hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Không tìm thấy cuộc trò chuyện hoặc người dùng không có quyền truy cập.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'Vượt quá giới hạn tần suất yêu cầu (tối đa 120 yêu cầu / phút).',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi hệ thống nội bộ.',
    type: ChatErrorEnvelopeDto,
  })
  async get(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(await this.messages.get(user, id));
  }

  @Get('api/v1/conversations/:id/messages')
  @ApiOperation({
    summary: 'Lấy lịch sử tin nhắn trong cuộc trò chuyện',
    description:
      'Trả về danh sách tin nhắn theo phân trang sequence (số thứ tự). Có thể lấy tin nhắn cũ hơn bằng `beforeSequence` hoặc mới hơn bằng `afterSequence` (không dùng cả hai cùng lúc). Danh sách tin nhắn trả về luôn theo thứ tự sequence tăng dần.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID định danh duy nhất của cuộc trò chuyện.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description:
      'Số lượng tin nhắn tối đa trả về trên mỗi trang (1-100, mặc định: 30).',
  })
  @ApiQuery({
    name: 'beforeSequence',
    required: false,
    type: String,
    description:
      'Lấy tin nhắn có số thứ tự nhỏ hơn sequence này (tin nhắn cũ hơn).',
  })
  @ApiQuery({
    name: 'afterSequence',
    required: false,
    type: String,
    description:
      'Lấy tin nhắn có số thứ tự lớn hơn sequence này (tin nhắn mới hơn).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lịch sử tin nhắn được phân trang theo sequence.',
    type: MessageHistoryResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Tham số truy vấn hoặc sequence không hợp lệ, hoặc sử dụng đồng thời cả beforeSequence và afterSequence.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Yêu cầu Bearer JWT token hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Không tìm thấy cuộc trò chuyện hoặc người dùng không có quyền truy cập.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'Vượt quá giới hạn tần suất yêu cầu (tối đa 120 yêu cầu / phút).',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi hệ thống nội bộ.',
    type: ChatErrorEnvelopeDto,
  })
  async history(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    return this.envelope(
      await this.messages.history(
        user,
        id,
        this.query(query) as MessageListQuery,
      ),
    );
  }

  @Patch('api/v1/conversations/:id/read')
  @ApiOperation({
    summary: 'Cập nhật trạng thái đã đọc tin nhắn',
    description:
      'Cập nhật con trỏ đọc (read sequence) của người dùng hiện tại lên vị trí `lastReadSequence`. Con trỏ chỉ tăng đơn điệu (monotonic) và không thể vượt quá sequence cao nhất hiện có (`highWaterSequence`). Sau khi cập nhật thành công, sự kiện `message.read.updated` sẽ được phát tán qua Socket.IO tới các thiết bị liên quan.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'ID định danh duy nhất của cuộc trò chuyện.',
  })
  @ApiBody({ type: MessageReadDto })
  @ApiResponse({
    status: 200,
    description: 'Trạng thái đã đọc được cập nhật thành công.',
    type: MessageReadResponseEnvelopeDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Sequence không hợp lệ hoặc vượt quá sequence cao nhất của cuộc trò chuyện.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Yêu cầu Bearer JWT token hợp lệ.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Không tìm thấy cuộc trò chuyện hoặc người dùng không có quyền truy cập.',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 429,
    description:
      'Vượt quá giới hạn tần suất yêu cầu (tối đa 120 yêu cầu / phút).',
    type: ChatErrorEnvelopeDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi hệ thống nội bộ.',
    type: ChatErrorEnvelopeDto,
  })
  async read(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: MessageReadDto,
  ) {
    const user = await this.user(req);
    this.rates.take(`rest:${user}`, 120, 60000);
    if (!body || Object.keys(body).some((k) => k !== 'lastReadSequence'))
      throw new ChatError('VALIDATION_ERROR');
    validateInput('message.read', { conversationId: id, ...body });
    return this.envelope(
      await this.messages.read(user, id, body.lastReadSequence),
    );
  }
}
