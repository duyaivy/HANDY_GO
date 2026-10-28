import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ORDER_ERROR_CODES,
  ORDER_ERROR_MESSAGES,
} from '../common/constants/order-errors.js';
import type { BiddingEligibilityResponseDto } from './dto/bidding-eligibility-response.dto.js';
import type { PaymentEligibilityResponseDto } from './dto/payment-eligibility-response.dto.js';

@Injectable()
export class InternalOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal query for Bidding Service to verify if a Service Request is eligible for bids.
   */
  async getBiddingEligibility(
    serviceRequestId: string,
    workerId?: string,
  ): Promise<BiddingEligibilityResponseDto> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: serviceRequestId },
    });

    if (!request) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.SERVICE_REQUEST_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.SERVICE_REQUEST_NOT_FOUND,
      });
    }

    const now = new Date();
    const isDeadlineActive =
      !request.biddingClosesAt || request.biddingClosesAt > now;
    const isStatusOpen = request.status === 'open_for_bidding';

    let isEligible = isStatusOpen && isDeadlineActive;
    let reason: string | undefined;

    if (!isStatusOpen) {
      reason = `Service request is in '${request.status}' status, not open for bidding`;
    } else if (!isDeadlineActive) {
      reason = 'Bidding deadline has expired';
    } else if (workerId && request.customerUserId === workerId) {
      isEligible = false;
      reason = 'Khách hàng không thể tự gửi báo giá cho yêu cầu dịch vụ của chính mình';
    }

    return {
      serviceRequestId: request.id,
      eligible: isEligible,
      isEligible,
      status: request.status,
      requestStatus: request.status,
      biddingClosesAt: request.biddingClosesAt,
      serviceId: request.serviceId,
      customerUserId: request.customerUserId,
      reason,
    };
  }

  /**
   * Internal query for Payment Service to verify completed status and retrieve exact decimal price.
   */
  async getPaymentEligibility(
    orderId: string,
  ): Promise<PaymentEligibilityResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException({
        code: ORDER_ERROR_CODES.ORDER_NOT_FOUND,
        message: ORDER_ERROR_MESSAGES.ORDER_NOT_FOUND,
      });
    }

    const isCompleted = order.status === 'completed';
    const isNotPaid = order.paymentState !== 'paid';
    const isEligibleForSettlement = isCompleted && isNotPaid;

    let reason: string | undefined;
    if (!isCompleted) {
      reason = `Order status is '${order.status}', not completed`;
    } else if (!isNotPaid) {
      reason = `Order is already in '${order.paymentState}' payment state`;
    }

    const agreedPrice =
      typeof order.agreedPrice?.toString === 'function'
        ? order.agreedPrice.toString()
        : String(order.agreedPrice);

    return {
      orderId: order.id,
      orderCode: order.orderCode,
      status: order.status,
      paymentState: order.paymentState,
      customerUserId: order.customerUserId,
      workerUserId: order.workerUserId,
      serviceId: order.serviceId,
      agreedPrice,
      currency: 'VND',
      isEligibleForSettlement,
      reason,
    };
  }
}
