import { ApiGatewayModule } from './api-gateway.module.js';
import { bootstrapApplication } from '@app/common';
import { setupSwagger } from './swagger/index.js';

await bootstrapApplication(ApiGatewayModule, {
  setupApp: (app) => {
    // Only trust explicitly configured proxy addresses; never trust arbitrary XFF.
    const trustedProxies = process.env.TRUSTED_PROXY_CIDRS
      ?.split(',').map((value) => value.trim()).filter(Boolean);
    if (trustedProxies?.length) {
      app.getHttpAdapter().getInstance().set('trust proxy', trustedProxies);
    }
    setupSwagger(app);
  },
});
