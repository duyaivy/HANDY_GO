import { AuthServiceModule } from './auth-service.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(AuthServiceModule);
