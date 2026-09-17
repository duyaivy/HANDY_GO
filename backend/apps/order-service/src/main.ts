import { OrderServiceModule } from './order-service.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(OrderServiceModule);
