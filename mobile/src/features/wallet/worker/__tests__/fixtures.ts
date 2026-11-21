import type { OrderPaymentRecord } from '../../types/payment.types';
import type { BankAccount, WalletData, WithdrawalRecord } from '../../types/wallet.types';

export const workerWallet: WalletData = { id: 'wallet-1', userId: 'worker-1', balance: '300000', availableBalance: '300000', reservedBalance: '0', status: 'active', createdAt: '2026-11-20', updatedAt: '2026-11-20' };
export const bankAccount: BankAccount = { id: 'bank-1', userId: 'worker-1', bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A', isDefault: true, createdAt: '2026-11-20', updatedAt: '2026-11-20' };
export const withdrawal: WithdrawalRecord = { id: 'withdrawal-1', userId: 'worker-1', walletId: 'wallet-1', bankAccountId: 'bank-1', amount: '100000', status: 'requested', idempotencyKey: 'withdrawal-key', payoutOperationId: 'operation-1', payoutReference: null, payoutClaimedAt: null, reviewReason: null, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' };
export const workerPayment: OrderPaymentRecord = { id: 'payment-1', orderId: 'order-1', customerUserId: 'customer-1', workerUserId: 'worker-1', amount: '200000', currency: 'VND', method: 'cash', status: 'pending', platformFee: '50000', workerEarning: '150000', refundedAmount: '0', orderCompletedAt: '2026-11-20T10:00:00Z', paidAt: null, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' };
export const response = <T>(data: T) => ({ statusCode: 200, message: 'ok', data });
