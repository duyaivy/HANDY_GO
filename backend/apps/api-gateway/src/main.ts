import { ApiGatewayModule } from './api-gateway.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(ApiGatewayModule);
