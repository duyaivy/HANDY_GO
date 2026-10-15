import { WalletServiceModule } from './wallet-service.module.js';
import { bootstrapApplication } from '@app/common';

await bootstrapApplication(WalletServiceModule);
