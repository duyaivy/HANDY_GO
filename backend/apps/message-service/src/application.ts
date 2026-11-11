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
          '👉 **Real-time Chat:** Giao thức gửi tin nhắn tức thời và sự kiện thời gian thực được xử lý qua **Socket.IO** tại đường dẫn `/api/v1/chat/socket.io/` (xem chi tiết tại tài liệu [Socket.IO Contracts](https://github.com/duyaivy/HANDY_GO/blob/main/docs/message-service/SOCKET-IO-CONTRACTS.md)), không thông qua REST endpoints.\n\n' +
          '> 💡 Khi gọi thử nghiệm qua Swagger UI (Try it out), các yêu cầu sẽ được định tuyến thông qua API Gateway.',
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
