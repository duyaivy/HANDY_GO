import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DeadLetterController } from '../src/dead-letter/dead-letter.controller.js';
import { HealthController } from '../src/health/health.controller.js';
import { PaymentDebitController } from '../src/payment-debit/payment-debit.controller.js';
import { RefundAdjustmentController } from '../src/refund-adjustment/refund-adjustment.controller.js';
import { TopupSettlementController } from '../src/topup-settlement/topup-settlement.controller.js';
import { WalletEventsController } from '../src/wallet-events/wallet-events.controller.js';
import { WalletLedgerController } from '../src/wallet-ledger/wallet-ledger.controller.js';
import { WalletProvisioningController } from '../src/wallet-provisioning/wallet-provisioning.controller.js';
import { WalletQueryController } from '../src/wallet-query/wallet-query.controller.js';
import { WalletServiceController } from '../src/wallet-service.controller.js';
import { WithdrawalController } from '../src/withdrawal/withdrawal.controller.js';
import { WorkerCommissionController } from '../src/worker-commission/worker-commission.controller.js';

describe('Wallet OpenAPI startup', () => {
  it('generates all controller schemas with numeric outbox and pagination limits', async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DeadLetterController,
        HealthController,
        PaymentDebitController,
        RefundAdjustmentController,
        TopupSettlementController,
        WalletEventsController,
        WalletLedgerController,
        WalletProvisioningController,
        WalletQueryController,
        WalletServiceController,
        WithdrawalController,
        WorkerCommissionController,
      ],
    })
      .useMocker(() => ({}))
      .compile();
    const app = module.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      // Swagger runs before listen() in main.ts; no database or broker is needed.
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      expect(document.paths['/api/v1/internal/wallet-events/publish-pending'].post)
        .toBeDefined();
      expect(document.components?.schemas?.PublishOutboxDto).toMatchObject({
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        },
      });
      expect(document.paths['/api/v1/wallets/me/transactions'].get?.parameters)
        .toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'page', in: 'query', required: false,
            schema: expect.objectContaining({ type: 'number', minimum: 1, default: 1 }),
          }),
          expect.objectContaining({
            name: 'limit', in: 'query', required: false,
            schema: expect.objectContaining({ type: 'number', minimum: 1, maximum: 100, default: 20 }),
          }),
        ]));
    } finally {
      await app.close();
    }
  });
});
