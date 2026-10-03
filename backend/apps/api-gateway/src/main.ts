import { ApiGatewayModule } from './api-gateway.module.js';
import { bootstrapApplication } from '@app/common';
import { setupSwagger } from './swagger/index.js';

await bootstrapApplication(ApiGatewayModule, (app) => {
  setupSwagger(app);
});



