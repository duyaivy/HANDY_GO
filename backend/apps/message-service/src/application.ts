import 'reflect-metadata';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { MessageModule } from './message.module.js';
import type { MessageAppOptions } from './message.options.js';
import { MessageRuntimeService } from './message-runtime.service.js';

export type { MessageAppOptions } from './message.options.js';

export async function createMessageApp(options: MessageAppOptions) {
  let app: NestExpressApplication | undefined;
  try {
    app = await NestFactory.create<NestExpressApplication>(
      MessageModule.register(options),
      {
        bufferLogs: true,
        bodyParser: false,
        abortOnError: false,
      },
    );
    app.useLogger(app.get(Logger));
    app.useBodyParser('json', { limit: '16kb', strict: true });
    app.enableShutdownHooks();
    app.enableCors({ origin: options.origins, credentials: true });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('HANDY_GO Message Service API')
      .setDescription(
        'Tài liệu API REST cho Message Service (Dịch vụ Chat & Tin nhắn trực tiếp).\n\n' +
          '### Kiến trúc định tuyến & Tài liệu API:\n' +
          '- **Public Swagger UI:** `https://handygo.duyaivy.id.vn/docs` (tích hợp dropdown đa dịch vụ tại Gateway).\n' +
          '- **Public Message Service OpenAPI Spec:** `https://handygo.duyaivy.id.vn/docs/specs/message-service` (Gateway fetch nội bộ từ Message Service và chuẩn hóa cho trình duyệt).\n' +
          '- **Public Gateway OpenAPI JSON:** `https://handygo.duyaivy.id.vn/docs-json`.\n' +
          '- **Internal Message Service OpenAPI JSON:** `http://10.77.0.4:3009/docs-json` (nội bộ WireGuard VPS4).\n' +
          '- **Message Service REST API Traffic:** Các endpoint `/api/v1/conversations` được Nginx VPS1 định tuyến trực tiếp đến Message Service VPS4 (`http://10.77.0.4:3009`), không qua proxy của API Gateway.\n' +
          '- **Socket.IO Real-time Chat:** `/api/v1/chat/socket.io/` được Nginx VPS1 định tuyến trực tiếp đến VPS4 (`http://10.77.0.4:3009`), hỗ trợ Long-Polling và WebSocket sticky upgrades (xem chi tiết tại [Socket.IO Contracts](https://github.com/duyaivy/HANDY_GO/blob/main/docs/message-service/SOCKET-IO-CONTRACTS.md)).\n\n' +
          '> 💡 Khi gọi thử nghiệm qua Swagger UI (Try it out) tại `https://handygo.duyaivy.id.vn/docs`, trình duyệt gửi yêu cầu trực tiếp qua Nginx VPS1 tới Message Service VPS4.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Nhập JWT Access Token của người dùng (lấy từ POST /api/v1/auth/login)',
        },
        'JWT-Auth',
      )
      .addTag(
        'Conversations',
        'Endpoints quản lý cuộc trò chuyện, lịch sử tin nhắn và trạng thái đã đọc',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    // Preserve factory-before-init startup. Imported modules use onModuleInit.
    await app.get(MessageRuntimeService).start();
    return app;
  } catch (error) {
    try {
      if (app) await app.close();
      else await options.db.$disconnect();
    } catch {
      new NestLogger('MessageApplication').error({
        errorCode: 'MESSAGE_SETUP_CLEANUP_FAILED',
      });
    }
    throw error;
  }
}
