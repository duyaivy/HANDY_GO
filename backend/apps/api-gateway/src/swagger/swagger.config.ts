import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('HANDY GO API Gateway')
    .setDescription(
      'Unified API Gateway for HANDY GO platform, routing requests to 10 downstream microservices.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT Access Token',
      },
      'JWT-Auth',
    )
    .addTag('Gateway', 'Gateway health check and root endpoints')
    .addTag('Auth', 'Authentication, authorization and session management')
    .addTag('Users', 'User accounts, profiles and trust scoring')
    .addTag('Catalog', 'Service categories and worker skill listings')
    .addTag('Orders', 'Service booking requests and orders')
    .addTag('Bidding', 'Worker quotations and price bidding')
    .addTag('Matching', 'Automated client-worker matching algorithm')
    .addTag('Payments', 'Payment processing and transactions')
    .addTag('Notifications', 'Push notifications, SMS and email alerts')
    .addTag('Wallets', 'User and worker digital wallet management')
    .addTag('Tracking', 'Real-time worker GPS tracking and dispatching')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
