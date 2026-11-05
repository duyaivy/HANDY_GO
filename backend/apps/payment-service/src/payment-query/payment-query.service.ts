import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { Prisma } from '@prisma/payment-client';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { PaymentPaginationDto, PaymentQueryDto } from './dto/payment-query.dto.js';

const paymentSelect = {
  id: true,
  orderId: true,
  customerUserId: true,
  workerUserId: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  platformFee: true,
  workerEarning: true,
  orderCompletedAt: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

@Injectable()
export class PaymentQueryService {
  constructor(private readonly database: PaymentPrismaService) {}

  private visibleTo(userId: string): Prisma.PaymentWhereInput {
    return { OR: [{ customerUserId: userId }, { workerUserId: userId }] };
  }

  private serialize(payment: PaymentRecord) {
    return {
      ...payment,
      amount: payment.amount.toString(),
      platformFee: payment.platformFee.toString(),
      workerEarning: payment.workerEarning.toString(),
    };
  }

  async findById(id: string, userId: string) {
    const payment = await this.database.client.payment.findFirst({
      where: { id, ...this.visibleTo(userId) },
      select: paymentSelect,
    });
    if (!payment) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
    return this.serialize(payment);
  }

  async findByOrder(orderId: string, userId: string) {
    const payment = await this.database.client.payment.findFirst({
      where: { orderId, ...this.visibleTo(userId) },
      select: paymentSelect,
    });
    if (!payment) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
    return this.serialize(payment);
  }

  async list(userId: string, query: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...this.visibleTo(userId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
    };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.payment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.client.payment.count({ where }),
    ]);
    return { items: items.map((item) => this.serialize(item)), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async listAttempts(id: string, userId: string, query: PaymentPaginationDto) {
    const payment = await this.database.client.payment.findFirst({
      where: { id, ...this.visibleTo(userId) },
      select: { id: true },
    });
    if (!payment) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
    const where: Prisma.PaymentAttemptWhereInput = { paymentId: payment.id };
    const [items, total] = await this.database.client.$transaction([
      this.database.client.paymentAttempt.findMany({
        where,
        select: { id: true, attemptNo: true, method: true, status: true, attemptedAt: true, completedAt: true },
        orderBy: { attemptNo: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.database.client.paymentAttempt.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }
}
