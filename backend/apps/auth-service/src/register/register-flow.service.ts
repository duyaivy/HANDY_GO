import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import type { Account } from '@prisma/auth-client';
import { AuthPrismaService } from '@app/database';
import {
  AppException,
  ERROR_CODES,
  EVENT_PATTERNS,
  OutboxPublisherService,
} from '@app/common';
import { RegisterRole, Role } from '@app/auth';
import { RegisterDto } from './dto/register.dto.js';
import type { RegisterResponse } from './dto/register-response.dto.js';
import { OtpService } from '../otp/otp.service.js';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service.js';
import { normalizeVietnamesePhone } from '../common/utils/phone.util.js';
import { AuthResponseBuilder } from '../common/utils/auth-response.builder.js';
import {
  REGISTER_IP_RATE_LIMIT,
  REGISTER_IP_WINDOW_SECONDS,
} from '../common/constants/auth.constants.js';

@Injectable()
export class RegisterFlowService {
  private readonly logger = new Logger(RegisterFlowService.name);

  constructor(
    private readonly db: AuthPrismaService,
    private readonly otpService: OtpService,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async execute(
    dto: RegisterDto,
    clientIp = '127.0.0.1',
  ): Promise<RegisterResponse> {
    // 1. IP rate limiting
    await this.rateLimiter.checkAndIncrement(
      `register_ip:${clientIp}`,
      REGISTER_IP_RATE_LIMIT,
      REGISTER_IP_WINDOW_SECONDS,
      'Bạn đã gửi quá số lần đăng ký cho phép trong 1 giờ. Vui lòng thử lại sau.',
    );

    const normalizedPhone = normalizeVietnamesePhone(dto.phone);
    const normalizedEmail = dto.email.trim().toLowerCase();
    const trimmedFullName = dto.fullName.trim();

    // 2. Check existing account by phone
    const existingPhone = await this.db.account.findUnique({
      where: { phone: normalizedPhone },
      include: {
        otpChallenges: {
          where: { isUsed: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingPhone) {
      if (existingPhone.status === 'pending') {
        const challenge = existingPhone.otpChallenges[0];
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.PHONE_ALREADY_EXISTS,
          'Số điện thoại đã được đăng ký nhưng chưa xác thực. Vui lòng đăng nhập để tiếp tục xác thực OTP.',
          {
            data: {
              verification: {
                phone: existingPhone.phone,
                emailMasked: existingPhone.email
                  ? this.otpService.maskEmail(existingPhone.email)
                  : '***',
                expiresAt: challenge?.expiresAt?.toISOString(),
                resendAvailableAt:
                  challenge?.resendAvailableAt?.toISOString() ||
                  new Date().toISOString(),
              },
            },
          },
        );
      }
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.PHONE_ALREADY_EXISTS,
        'Số điện thoại đã được đăng ký',
      );
    }

    // Check existing account by email
    const existingEmail = await this.db.account.findUnique({
      where: { email: normalizedEmail },
      include: {
        otpChallenges: {
          where: { isUsed: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingEmail) {
      if (existingEmail.status === 'pending') {
        const challenge = existingEmail.otpChallenges[0];
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.EMAIL_ALREADY_EXISTS,
          'Email đã được đăng ký nhưng chưa xác thực. Vui lòng đăng nhập để tiếp tục xác thực OTP.',
          {
            data: {
              verification: {
                phone: existingEmail.phone,
                emailMasked: this.otpService.maskEmail(normalizedEmail),
                expiresAt: challenge?.expiresAt?.toISOString(),
                resendAvailableAt:
                  challenge?.resendAvailableAt?.toISOString() ||
                  new Date().toISOString(),
              },
            },
          },
        );
      }
      throw new AppException(
        HttpStatus.CONFLICT,
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'Email đã được đăng ký',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const otp = this.otpService.generateOtp();
    const eventId = crypto.randomUUID();

    const defaultRoles = await this.db.role.findMany({
      where: {
        code: {
          in: [Role.CUSTOMER.toUpperCase(), Role.WORKER.toUpperCase()],
        },
      },
    });
    if (defaultRoles.length < 2) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        'Vai trò đăng ký chưa được khởi tạo đầy đủ',
      );
    }

    const accountId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const challengeId = crypto.randomUUID();
    const createdAt = new Date();

    let account: Account;
    try {
      account = await this.db.$transaction(async (tx) => {
        const newAccount = await tx.account.create({
          data: {
            id: accountId,
            userId,
            phone: normalizedPhone,
            email: normalizedEmail,
            passwordHash,
            status: 'pending',
            createdAt,
            updatedAt: createdAt,
            roles: {
              create: defaultRoles.map((role) => ({
                roleId: role.id,
                assignedAt: createdAt,
              })),
            },
            otpChallenges: {
              create: {
                id: challengeId,
                type: 'verify_email',
                otpHash: otp.hash,
                expiresAt: otp.expiresAt,
                resendAvailableAt: otp.resendAvailableAt,
                attempts: 0,
                isUsed: false,
                deliveryStatus: 'pending',
              },
            },
          },
        });

        const outboxPayload = {
          eventId,
          eventVersion: 3,
          occurredAt: new Date().toISOString(),
          producer: 'auth-service',
          data: {
            userId: newAccount.userId,
            accountId: newAccount.id,
            fullName: trimmedFullName,
            roles: [RegisterRole.CUSTOMER, RegisterRole.WORKER],
          },
        };

        await tx.outboxEvent.create({
          data: {
            id: eventId,
            eventType: EVENT_PATTERNS.USER_REGISTERED,
            eventVersion: 3,
            payload: outboxPayload,
            status: 'pending',
          },
        });

        return newAccount;
      });
    } catch (error: unknown) {
      const prismaError = error as {
        code?: string;
        meta?: { target?: string[] };
      };
      if (prismaError?.code === 'P2002') {
        const target = prismaError?.meta?.target;
        if (Array.isArray(target) && target.includes('phone')) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.PHONE_ALREADY_EXISTS,
            'Số điện thoại đã được đăng ký',
          );
        }
        if (Array.isArray(target) && target.includes('email')) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.EMAIL_ALREADY_EXISTS,
            'Email đã được đăng ký',
          );
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.CONFLICT,
          'Tài khoản đã tồn tại',
        );
      }
      throw error;
    }

    // 4. Send OTP email via SMTP
    try {
      await this.otpService.sendVerificationOtp(normalizedEmail, otp.code);
      await this.db.otpChallenge.updateMany({
        where: { accountId: account.id, otpHash: otp.hash },
        data: { deliveryStatus: 'delivered' },
      });
    } catch (smtpError) {
      this.logger.error(
        `SMTP delivery error for account ${account.id}: ${(smtpError as Error).message}`,
      );
      const now = new Date();
      await this.db.otpChallenge.updateMany({
        where: { accountId: account.id, otpHash: otp.hash },
        data: {
          deliveryStatus: 'failed',
          deliveryError: (smtpError as Error).message,
          resendAvailableAt: now,
        },
      });

      throw new AppException(
        HttpStatus.FAILED_DEPENDENCY,
        ERROR_CODES.OTP_DELIVERY_FAILED,
        'Tạo tài khoản thành công nhưng gửi mã OTP qua email thất bại. Vui lòng bấm gửi lại mã để tiếp tục.',
        {
          data: {
            verification: {
              challengeId,
              phone: normalizedPhone,
              emailMasked: this.otpService.maskEmail(normalizedEmail),
              resendAvailableAt: now.toISOString(),
              expiresAt: otp.expiresAt.toISOString(),
            },
          },
        },
      );
    }

    // Trigger immediate outbox publish in background
    void this.outboxPublisher.triggerPublish();

    return AuthResponseBuilder.buildRegisterResponse(
      account,
      { phone: normalizedPhone, email: normalizedEmail },
      otp,
      this.otpService.maskEmail(normalizedEmail),
      challengeId,
    );
  }
}

export { RegisterFlowService as RegisterService };
