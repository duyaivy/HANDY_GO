import { PaymentServiceModule } from './payment-service.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(PaymentServiceModule);
