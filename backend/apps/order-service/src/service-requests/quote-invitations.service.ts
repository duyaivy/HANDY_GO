import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EVENT_PATTERNS } from '@app/common';
import type { ServiceRequest } from '@prisma/order-client';
import { RequestStatus, WorkerSelectionSource } from '@prisma/order-client';
import { ProposalSourceVerifierService } from '../booking-proposals/services/proposal-source-verifier.service.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateQuoteInvitationDto } from './quote-invitations.controller.js';

@Injectable()
export class QuoteInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: ProposalSourceVerifierService,
    private readonly outbox: OrderOutboxRepository,
  ) {}

  async list(requestId: string, userId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      select: { customerUserId: true },
    });
    return this.prisma.quoteInvitation.findMany({
      where: {
        serviceRequestId: requestId,
        ...(request?.customerUserId === userId ? {} : { workerUserId: userId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    requestId: string,
    customerId: string,
    dto: CreateQuoteInvitationDto,
  ) {
    const assertOwner = (request: ServiceRequest | null): ServiceRequest => {
      if (!request)
        throw new NotFoundException('Không tìm thấy yêu cầu dịch vụ.');
      if (
        request.customerUserId !== customerId ||
        dto.workerUserId === customerId
      ) {
        throw new ForbiddenException('Bạn không có quyền gửi lời mời này.');
      }
      return request;
    };
    const assertOpen = (request: ServiceRequest) => {
      if (
        request.status !== RequestStatus.open_for_bidding ||
        (request.biddingClosesAt && request.biddingClosesAt <= new Date())
      ) {
        throw new ConflictException('Yêu cầu đã ngừng nhận báo giá.');
      }
    };
    const request = assertOwner(
      await this.prisma.serviceRequest.findUnique({ where: { id: requestId } }),
    );
    const key = { serviceRequestId: requestId, workerUserId: dto.workerUserId };
    const where = { serviceRequestId_workerUserId: key };
    const existing = await this.prisma.quoteInvitation.findUnique({ where });
    if (existing) return existing;
    assertOpen(request);

    await this.verifier.verifyProposalSource({
      selectionSource: WorkerSelectionSource.recommendation,
      serviceRequestId: requestId,
      workerUserId: dto.workerUserId,
      sourceMatchResultId: dto.sourceMatchResultId,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM order_service.service_requests
        WHERE id = ${requestId}::uuid FOR UPDATE
      `;
      const locked = assertOwner(
        await tx.serviceRequest.findUnique({ where: { id: requestId } }),
      );
      const saved = await tx.quoteInvitation.findUnique({ where });
      if (saved) return saved;
      assertOpen(locked);
      if (locked.matchingRevision !== request.matchingRevision) {
        throw new ConflictException(
          'Danh sách thợ gợi ý đã thay đổi. Vui lòng tải lại.',
        );
      }

      const invitation = await tx.quoteInvitation.create({
        data: {
          ...key,
          sourceMatchResultId: dto.sourceMatchResultId,
          note: dto.note?.trim() || null,
        },
      });
      await this.outbox.createEvent(
        {
          aggregateType: 'quote_invitation',
          aggregateId: invitation.id,
          eventType: EVENT_PATTERNS.QUOTE_INVITATION_CREATED,
          payload: {
            invitationId: invitation.id,
            requestId,
            customerId,
            workerId: dto.workerUserId,
          },
        },
        tx,
      );
      return invitation;
    });
  }
}
