import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  Optional,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { ConfigService } from '@app/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { SseService } from './sse.service.js';
import { isTrustedGateway } from '../common/utils/security.util.js';
import { RequestEligibilityVerifierService } from '../bids/services/request-eligibility-verifier.service.js';

@Controller('bids/requests')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(
    private readonly sseService: SseService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional()
    private readonly requestEligibilityVerifier?: RequestEligibilityVerifierService,
  ) {}

  /**
   * Connect to real-time Server-Sent Events stream for a service request.
   * Emits lightweight event signals ('ready', 'bid.changed', 'round.changed', 'matching.changed')
   * and 15s keepalive comments.
   * Zero confidential bid amounts, competitor IDs, or message contents are transmitted.
   */
  @Get(':requestId/events')
  async streamEvents(
    @Param('requestId') requestId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 1. Verify trusted gateway identity
    const rawSecret = req.headers['x-internal-secret'];
    const secret = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;
    if (!isTrustedGateway(secret, this.config.internalServiceSecret)) {
      throw new ForbiddenException('Invalid or missing internal service secret');
    }

    // 2. Extract caller user ID and roles
    const rawUserId = req.headers['x-user-id'];
    const userId = (Array.isArray(rawUserId) ? rawUserId[0] : rawUserId) as string | undefined;
    if (!userId) {
      throw new UnauthorizedException('Missing authenticated user ID');
    }

    const rawRoles = req.headers['x-user-roles'];
    const rolesHeader =
      ((Array.isArray(rawRoles) ? rawRoles[0] : rawRoles) as string) || '';
    const roles = rolesHeader
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    const isAdmin =
      roles.includes('admin') ||
      roles.includes('operator') ||
      roles.includes('superadmin');
    const isWorker = roles.includes('worker');

    // 3. Authorize caller access to this service request's event stream
    if (!isAdmin) {
      const round = await this.prisma.biddingRound.findUnique({
        where: { serviceRequestId: requestId },
      });

      if (!round) {
        throw new NotFoundException(
          `Phiên báo giá cho yêu cầu ${requestId} không tồn tại`,
        );
      }

      // Check request ownership first (covers customer role and multi-role customer+worker callers)
      const isOwner = Boolean(round.customerId && round.customerId === userId);

      if (isOwner) {
        // Customer owner is permitted to stream events for their request
      } else if (isWorker) {
        // Worker must either have placed an existing bid or verify KYC & trade eligibility
        const existingBid = await this.prisma.bid.findFirst({
          where: {
            biddingRoundId: round.id,
            workerId: userId,
          },
        });

        if (!existingBid) {
          if (!this.requestEligibilityVerifier) {
            throw new ForbiddenException(
              'Không thể xác thực điều kiện tham gia báo giá của thợ',
            );
          }
          await this.requestEligibilityVerifier.verifyEligibility(
            requestId,
            userId,
          );
        }
      } else {
        // Fail-closed rejection: non-owner customer, non-worker, or unauthorized role
        throw new ForbiddenException(
          'Bạn không có quyền truy cập sự kiện của yêu cầu dịch vụ này',
        );
      }
    }

    // 4. Register client in SSE manager (sets streaming headers and emits 'ready')
    this.sseService.registerClient({
      id: crypto.randomUUID(),
      requestId,
      userId,
      roles,
      res,
      connectedAt: new Date(),
    });
  }
}
