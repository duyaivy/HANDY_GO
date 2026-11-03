import { randomUUID } from 'node:crypto';
import { WalletPrismaService } from '../../../src/wallet-ledger/wallet-prisma.service.js';
import { WalletLedgerService } from '../../../src/wallet-ledger/wallet-ledger.service.js';
import { RefundAdjustmentService } from '../../../src/refund-adjustment/refund-adjustment.service.js';
import { PaymentDebitService } from '../../../src/payment-debit/payment-debit.service.js';
import { WithdrawalService } from '../../../src/withdrawal/withdrawal.service.js';
import type { BankAccountVerifier } from '../../../src/withdrawal/bank-account-verifier/bank-account-verifier.port.js';
import { assertTestTarget } from '../global-setup.js';
import { truncateAll } from './db.js';

export interface Harness {
  prisma: WalletPrismaService;
  ledger: WalletLedgerService;
  refunds: RefundAdjustmentService;
  payments: PaymentDebitService;
  withdrawals: WithdrawalService;
  close(): Promise<void>;
}

export async function createHarness(verifier?: BankAccountVerifier): Promise<Harness> {
  assertTestTarget();
  const prisma = new WalletPrismaService();
  await prisma.$connect();
  const ledger = new WalletLedgerService(prisma);
  const okVerifier: BankAccountVerifier = verifier ?? ({ verify: async () => true } as BankAccountVerifier);
  return {
    prisma,
    ledger,
    refunds: new RefundAdjustmentService(ledger),
    payments: new PaymentDebitService(ledger),
    withdrawals: new WithdrawalService(prisma, okVerifier),
    close: () => prisma.$disconnect(),
  };
}

export async function resetDb(): Promise<void> {
  await truncateAll();
}

export async function seedWallet(
  h: Harness,
  opts: { userId?: string; systemKey?: string; balance?: bigint } = {},
) {
  const userId = opts.systemKey ? undefined : (opts.userId ?? randomUUID());
  return h.prisma.wallet.create({
    data: { userId, systemKey: opts.systemKey, balance: opts.balance ?? 0n },
  });
}

export async function seedPlatform(h: Harness) {
  return seedWallet(h, { systemKey: 'PLATFORM_FEES' });
}

export async function seedPayment(
  h: Harness,
  input: { customerBalance: bigint; gross: bigint; worker: bigint; fee: bigint },
) {
  const customerUserId = randomUUID();
  const workerUserId = randomUUID();
  await seedWallet(h, { userId: customerUserId, balance: input.customerBalance });
  await seedWallet(h, { userId: workerUserId });
  const paymentId = randomUUID();
  await h.payments.debit(customerUserId, {
    paymentId,
    attemptId: 'a1',
    workerUserId,
    grossAmount: input.gross.toString(),
    workerEarning: input.worker.toString(),
    platformFee: input.fee.toString(),
  });
  return { customerUserId, workerUserId, paymentId };
}

export async function balanceOf(h: Harness, userId?: string, systemKey?: string) {
  const w = await h.prisma.wallet.findFirstOrThrow({ where: userId ? { userId } : { systemKey } });
  return { balance: w.balance, reserved: w.reservedBalance };
}

export async function sumOfAllBalances(h: Harness): Promise<bigint> {
  const agg = await h.prisma.wallet.aggregate({ _sum: { balance: true } });
  return agg._sum.balance ?? 0n;
}
