import { WalletServiceModule } from './wallet-service.module.js';
import { bootstrapApplication } from '@app/common';
import { createRabbitMQOptions } from '@app/rabbitmq';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor.js';

await bootstrapApplication(WalletServiceModule, {
  setupApp: (app) => {
    app.useGlobalInterceptors(new BigIntSerializerInterceptor());
    // bootstrapApplication bỏ qua Swagger mặc định khi có setupApp, nên dựng lại ở đây.
    const swaggerConfig = new DocumentBuilder()
      .setTitle('wallet-service API')
      .setDescription('API documentation for wallet-service')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  },
  connectMicroservices: (app) => {
    app.connectMicroservice(createRabbitMQOptions('wallet-service-events'));
  },
});
