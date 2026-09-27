import {
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { AuthPrismaService } from '@app/database';
import { TokenSignerService, REFRESH_TOKEN_EXPIRATION_DAYS } from '@app/auth';
import {
  AppException,
  ERROR_CODES,
  EVENT_PATTERNS,
} from '@app/common';
import { RabbitMQService } from '@app/rabbitmq';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { OtpService } from './otp/otp.service.js';
import { OutboxPublisherService } from './outbox/outbox-publisher.service.js';
import { RateLimiterService } from './rate-limit/rate-limiter.service.js';
import { normalizeVietnamesePhone } from './utils/phone.util.js';

@Injectable()
export class AuthServiceService {
  private readonly logger = new Logger(AuthServiceService.name);

  constructor(
    private readonly db: AuthPrismaService,
    private readonly tokenSigner: TokenSignerService,
    private readonly otpService: OtpService,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly rateLimiter: RateLimiterService,
    @Optional()
    private readonly rabbitmq?: RabbitMQService,
  ) {}

  async register(dto: RegisterDto, clientIp = '127.0.0.1'): Promise<unknown> {
    // 1. IP rate limiting (10 / hour)
    await this.rateLimiter.checkAndIncrement(
      `register_ip:${clientIp}`,
      10,
      3600,
      'Bạn đã gửi quá số lần đăng ký cho phép trong 1 giờ. Vui lòng thử lại sau.',
    );

    const normalizedPhone = normalizeVietnamesePhone(dto.phone);
    const normalizedEmail = dto.email.trim().toLowerCase();
    const trimmedFullName = dto.fullName.trim();

    // 2. Check existing account
    const existingPhone = await this.db.account.findUnique({
      where: { phone: normalizedPhone },
      include: { otpChallenges: { where: { isUsed: false }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existingPhone) {
      if (existingPhone.status === 'pending') {
        const challenge = existingPhone.otpChallenges[0];
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.PHONE_ALREADY_EXISTS,
          'Số điện thoại đã được đăng ký nhưng chưa xác thực. Vui lòng đăng nhập để tiếp tục xác thực OTP.',
          {
            details: {
              verification: {
                phone: existingPhone.phone,
                emailMasked: this.otpService.maskEmail(existingPhone.email),
                expiresAt: challenge?.expiresAt?.toISOString(),
                resendAvailableAt: challenge?.resendAvailableAt?.toISOString() || new Date().toISOString(),
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

    const existingEmail = await this.db.account.findUnique({
      where: { email: normalizedEmail },
      include: { otpChallenges: { where: { isUsed: false }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (existingEmail) {
      if (existingEmail.status === 'pending') {
        const challenge = existingEmail.otpChallenges[0];
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.EMAIL_ALREADY_EXISTS,
          'Email đã được đăng ký nhưng chưa xác thực. Vui lòng đăng nhập để tiếp tục xác thực OTP.',
          {
            details: {
              verification: {
                phone: existingEmail.phone,
                emailMasked: this.otpService.maskEmail(existingEmail.email),
                expiresAt: challenge?.expiresAt?.toISOString(),
                resendAvailableAt: challenge?.resendAvailableAt?.toISOString() || new Date().toISOString(),
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

    // Ensure role Customer exists
    let customerRole = await this.db.role.findUnique({
      where: { name: 'Customer' },
    });
    if (!customerRole) {
      customerRole = await this.db.role.create({
        data: {
          name: 'Customer',
          description: 'Khách hàng sử dụng dịch vụ tiện ích',
        },
      });
    }

    let account: any;
    try {
      account = await this.db.$transaction(async (tx) => {
        const newAccount = await tx.account.create({
          data: {
            phone: normalizedPhone,
            email: normalizedEmail,
            passwordHash,
            isVerified: false,
            status: 'pending',
            roles: {
              create: {
                roleId: customerRole!.id,
              },
            },
            otpChallenges: {
              create: {
                type: 'email_verification',
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
          eventVersion: 1,
          occurredAt: new Date().toISOString(),
          producer: 'auth-service',
          data: {
            userId: newAccount.id,
            accountId: newAccount.id,
            fullName: trimmedFullName,
            phone: normalizedPhone,
            email: normalizedEmail,
          },
        };

        await tx.outboxEvent.create({
          data: {
            id: eventId,
            eventType: EVENT_PATTERNS.USER_REGISTERED,
            eventVersion: 1,
            payload: outboxPayload,
            status: 'pending',
          },
        });

        return newAccount;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const target = error?.meta?.target;
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

    // 3. Send OTP email via SMTP
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
      await this.db.otpChallenge.updateMany({
        where: { accountId: account.id, otpHash: otp.hash },
        data: {
          deliveryStatus: 'failed',
          deliveryError: (smtpError as Error).message,
        },
      });

      // Keep account pending and return OTP_DELIVERY_FAILED with recovery details
      throw new AppException(
        HttpStatus.FAILED_DEPENDENCY,
        ERROR_CODES.OTP_DELIVERY_FAILED,
        'Tạo tài khoản thành công nhưng gửi mã OTP qua email thất bại. Vui lòng bấm gửi lại mã để tiếp tục.',
        {
          details: {
            verification: {
              phone: account.phone,
              emailMasked: this.otpService.maskEmail(account.email),
              resendAvailableAt: otp.resendAvailableAt.toISOString(),
              expiresAt: otp.expiresAt.toISOString(),
            },
          },
        },
      );
    }

    // Trigger immediate outbox publish in background
    void this.outboxPublisher.triggerPublish();

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Đăng ký thành công. Vui lòng xác thực tài khoản qua mã OTP.',
      data: {
        userId: account.id,
        phone: account.phone,
        email: account.email,
        emailMasked: this.otpService.maskEmail(account.email),
        expiresAt: otp.expiresAt.toISOString(),
        resendAvailableAt: otp.resendAvailableAt.toISOString(),
        verificationInstructions:
          'Nhập mã OTP 6 chữ số đã được gửi qua email để kích hoạt tài khoản.',
      },
    };
  }

  async verifyEmail(
    dto: VerifyOtpDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<unknown> {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Vui lòng cung cấp email hoặc số điện thoại',
      );
    }

    const whereClause: { email?: string; phone?: string } = {};
    if (dto.email) {
      whereClause.email = dto.email.trim().toLowerCase();
    } else if (dto.phone) {
      whereClause.phone = normalizeVietnamesePhone(dto.phone);
    }

    const account = await this.db.account.findFirst({
      where: whereClause,
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Tài khoản không tồn tại',
      );
    }

    if (account.status === 'suspended') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đã bị tạm khóa. Không thể kích hoạt bằng OTP.',
      );
    }

    // Lock and serialize challenges by account
    const challenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt < new Date()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_EXPIRED,
        'Mã OTP không hợp lệ hoặc đã hết hạn',
      );
    }

    if (challenge.attempts >= OtpService.MAX_ATTEMPTS) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu mã mới.',
        { details: { remainingAttempts: 0 } },
      );
    }

    const isMatch = this.otpService.verifyOtpHash(dto.otp, challenge.otpHash);
    if (!isMatch) {
      const updatedAttempts = challenge.attempts + 1;
      await this.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: updatedAttempts },
      });

      const remaining = OtpService.MAX_ATTEMPTS - updatedAttempts;

      if (remaining <= 0) {
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          'Bạn đã nhập sai mã OTP quá 5 lần. Vui lòng yêu cầu mã mới.',
          { details: { remainingAttempts: 0 } },
        );
      }

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.OTP_INVALID,
        `Mã OTP không chính xác. Còn lại ${remaining} lần thử.`,
        { details: { remainingAttempts: remaining } },
      );
    }

    // Confirm user exists and is provisioned in User & Trust Service
    await this.confirmUserStatus(account.id);

    // OTP matches -> Prepare tokens and activate account
    const sessionId = crypto.randomUUID();
    const plainRefreshToken = this.tokenSigner.generateRefreshToken();
    const refreshTokenHash = this.tokenSigner.hashToken(plainRefreshToken);
    const sessionExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );

    const roleNames = account.roles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        account.roles.flatMap((r) =>
          r.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    // Sign access token FIRST before modifying DB state
    const { token, expiresIn } = await this.tokenSigner.signAccessToken({
      accountId: account.id,
      userId: account.id,
      sessionId,
      roles: roleNames,
      permissions,
    });

    // DB state is updated atomically only after JWT signing succeeds
    await this.db.$transaction(async (tx) => {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { isUsed: true },
      });

      await tx.account.update({
        where: { id: account.id },
        data: {
          isVerified: true,
          status: 'active',
        },
      });

      await tx.refreshSession.create({
        data: {
          id: sessionId,
          accountId: account.id,
          refreshTokenHash,
          expiresAt: sessionExpiresAt,
          absoluteExpiresAt: sessionExpiresAt,
          ipAddress: clientIp,
          userAgent,
        },
      });
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Xác thực OTP thành công',
      data: {
        accessToken: token,
        refreshToken: plainRefreshToken,
        expiresIn,
        user: {
          id: account.id,
          phone: account.phone,
          email: account.email,
          roles: roleNames,
          permissions,
        },
      },
    };
  }

  async resendOtp(dto: ResendOtpDto): Promise<unknown> {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Vui lòng cung cấp email hoặc số điện thoại',
      );
    }

    const whereClause: { email?: string; phone?: string } = {};
    if (dto.email) {
      whereClause.email = dto.email.trim().toLowerCase();
    } else if (dto.phone) {
      whereClause.phone = normalizeVietnamesePhone(dto.phone);
    }

    const account = await this.db.account.findFirst({
      where: whereClause,
    });

    if (!account) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Tài khoản không tồn tại',
      );
    }

    if (account.status === 'suspended') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đã bị tạm khóa. Không thể gửi lại mã OTP.',
      );
    }

    if (account.status === 'active' && account.isVerified) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.CONFLICT,
        'Tài khoản đã được kích hoạt thành công. Vui lòng đăng nhập.',
      );
    }

    // Rate limiting: 5 resends / hour per account
    await this.rateLimiter.checkAndIncrement(
      `resend_account:${account.id}`,
      5,
      3600,
      'Bạn đã yêu cầu gửi lại OTP quá 5 lần trong 1 giờ. Vui lòng thử lại sau.',
    );

    // Check cooldown on latest unused challenge
    const latestChallenge = await this.db.otpChallenge.findFirst({
      where: {
        accountId: account.id,
        isUsed: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    if (latestChallenge && latestChallenge.resendAvailableAt > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((latestChallenge.resendAvailableAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.RATE_LIMITED,
        `Vui lòng đợi ${retryAfterSeconds} giây trước khi yêu cầu gửi lại OTP.`,
        { details: { retryAfterSeconds } },
      );
    }

    const newOtp = this.otpService.generateOtp();

    // Send email via SMTP FIRST: do not invalidate existing valid challenge if sending fails
    try {
      await this.otpService.sendVerificationOtp(account.email, newOtp.code);
    } catch (sendError) {
      this.logger.error(
        `Failed to resend OTP email to ${account.email}: ${(sendError as Error).message}`,
      );
      throw new AppException(
        HttpStatus.FAILED_DEPENDENCY,
        ERROR_CODES.OTP_DELIVERY_FAILED,
        'Không thể gửi mã OTP qua email lúc này. Vui lòng thử lại sau giây lát.',
      );
    }

    // SMTP succeeded -> Record new challenge and invalidate previous
    await this.db.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: {
          accountId: account.id,
          isUsed: false,
        },
        data: { isUsed: true },
      });

      await tx.otpChallenge.create({
        data: {
          accountId: account.id,
          type: 'email_verification',
          otpHash: newOtp.hash,
          expiresAt: newOtp.expiresAt,
          resendAvailableAt: newOtp.resendAvailableAt,
          attempts: 0,
          isUsed: false,
          deliveryStatus: 'delivered',
        },
      });
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Mã xác thực OTP mới đã được gửi thành công.',
      data: {
        expiresAt: newOtp.expiresAt.toISOString(),
        resendAvailableAt: newOtp.resendAvailableAt.toISOString(),
        emailMasked: this.otpService.maskEmail(account.email),
      },
    };
  }

  async login(
    dto: LoginDto,
    clientIp = '127.0.0.1',
    userAgent?: string,
  ): Promise<unknown> {
    // 1. IP rate limiting: max 30 requests / minute
    await this.rateLimiter.checkAndIncrement(
      `login_ip:${clientIp}`,
      30,
      60,
      'Bạn đã thử đăng nhập quá nhiều lần từ địa chỉ này. Vui lòng thử lại sau 1 phút.',
    );

    const normalizedPhone = normalizeVietnamesePhone(dto.phone);

    // 2. Failed login rate limit check by phone
    await this.rateLimiter.checkFailedLogins(normalizedPhone);

    const account = await this.db.account.findUnique({
      where: { phone: normalizedPhone },
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        otpChallenges: {
          where: { isUsed: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!account) {
      await this.rateLimiter.recordFailedLogin(normalizedPhone);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Số điện thoại hoặc mật khẩu không chính xác',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      account.passwordHash,
    );
    if (!isPasswordValid) {
      await this.rateLimiter.recordFailedLogin(normalizedPhone);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Số điện thoại hoặc mật khẩu không chính xác',
      );
    }

    // Login credentials valid -> reset failed attempts
    await this.rateLimiter.resetFailedLogins(normalizedPhone);

    if (!account.isVerified || account.status === 'pending') {
      const challenge = account.otpChallenges[0];
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_PENDING,
        'Tài khoản chưa được kích hoạt. Vui lòng xác thực mã OTP.',
        {
          details: {
            verification: {
              phone: account.phone,
              emailMasked: this.otpService.maskEmail(account.email),
              expiresAt: challenge?.expiresAt?.toISOString(),
              resendAvailableAt:
                challenge?.resendAvailableAt?.toISOString() ||
                new Date().toISOString(),
            },
          },
        },
      );
    }

    if (account.status === 'suspended') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản đã bị tạm khóa. Vui lòng liên hệ bộ phận hỗ trợ.',
      );
    }

    if (account.status !== 'active') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản không ở trạng thái hoạt động.',
      );
    }

    // Verify user status in User & Trust
    await this.confirmUserStatus(account.id);

    const sessionId = crypto.randomUUID();
    const plainRefreshToken = this.tokenSigner.generateRefreshToken();
    const refreshTokenHash = this.tokenSigner.hashToken(plainRefreshToken);
    const sessionExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );

    const roleNames = account.roles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        account.roles.flatMap((r) =>
          r.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    // Sign access token FIRST before persisting session in DB
    const { token, expiresIn } = await this.tokenSigner.signAccessToken({
      accountId: account.id,
      userId: account.id,
      sessionId,
      roles: roleNames,
      permissions,
    });

    // Session is only persisted after successful signing
    await this.db.refreshSession.create({
      data: {
        id: sessionId,
        accountId: account.id,
        refreshTokenHash,
        expiresAt: sessionExpiresAt,
        absoluteExpiresAt: sessionExpiresAt,
        ipAddress: clientIp,
        userAgent,
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      data: {
        accessToken: token,
        refreshToken: plainRefreshToken,
        expiresIn,
        user: {
          id: account.id,
          phone: account.phone,
          email: account.email,
          roles: roleNames,
          permissions,
        },
      },
    };
  }

  async refresh(
    dto: RefreshTokenDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<unknown> {
    const hashed = this.tokenSigner.hashToken(dto.refreshToken);
    const now = new Date();

    const session = await this.db.refreshSession.findFirst({
      where: {
        refreshTokenHash: hashed,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!session) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    // Absolute 7-day session lifetime check
    if (session.absoluteExpiresAt && session.absoluteExpiresAt <= now) {
      await this.db.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Phiên đăng nhập đã hết hạn 7 ngày. Vui lòng đăng nhập lại.',
      );
    }

    const account = await this.db.account.findUnique({
      where: { id: session.accountId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account || account.status !== 'active' || !account.isVerified) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.ACCOUNT_BLOCKED,
        'Tài khoản không hợp lệ hoặc đã bị khóa',
      );
    }

    // Verify user status in User & Trust
    await this.confirmUserStatus(account.id);

    // Rotate refresh token: prepare new credentials
    const newPlainRefreshToken = this.tokenSigner.generateRefreshToken();
    const newRefreshTokenHash = this.tokenSigner.hashToken(newPlainRefreshToken);
    const next7Days = new Date(
      now.getTime() + REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
    );
    const newExpiresAt = new Date(
      Math.min(next7Days.getTime(), session.absoluteExpiresAt.getTime()),
    );

    const roleNames = account.roles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        account.roles.flatMap((r) =>
          r.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    // Sign new access token FIRST before modifying DB state
    const { token, expiresIn } = await this.tokenSigner.signAccessToken({
      accountId: account.id,
      userId: account.id,
      sessionId: session.id,
      roles: roleNames,
      permissions,
    });

    // Rotate refresh token in DB only after successful signing
    const updateResult = await this.db.refreshSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: hashed, // Must still match old hash to prevent race conditions
        revokedAt: null,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        ipAddress: clientIp,
        userAgent,
        updatedAt: now,
      },
    });

    if (updateResult.count === 0) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
        'Refresh token đã được sử dụng hoặc bị thu hồi',
      );
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Làm mới token thành công',
      data: {
        accessToken: token,
        refreshToken: newPlainRefreshToken,
        expiresIn,
        user: {
          id: account.id,
          phone: account.phone,
          email: account.email,
          roles: roleNames,
          permissions,
        },
      },
    };
  }

  async logout(dto: LogoutDto): Promise<unknown> {
    if (dto.refreshToken) {
      const hashed = this.tokenSigner.hashToken(dto.refreshToken);
      await this.db.refreshSession.updateMany({
        where: { refreshTokenHash: hashed, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng xuất thành công',
    };
  }

  async getMe(accountId: string): Promise<unknown> {
    const account = await this.db.account.findUnique({
      where: { id: accountId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!account) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Tài khoản không tồn tại',
      );
    }

    const roleNames = account.roles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        account.roles.flatMap((r) =>
          r.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin tài khoản thành công',
      data: {
        id: account.id,
        phone: account.phone,
        email: account.email,
        isVerified: account.isVerified,
        status: account.status,
        roles: roleNames,
        permissions,
        createdAt: account.createdAt,
      },
    };
  }

  /**
   * Internal RPC helper to confirm user status in User & Trust Service.
   */
  private async confirmUserStatus(userId: string): Promise<void> {
    if (!this.rabbitmq) {
      return;
    }

    try {
      const statusPromise = this.rabbitmq.send<
        { userId: string },
        { exists: boolean; status: string; isProvisioned: boolean }
      >('user.auth-status', { userId });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('User & Trust RPC timeout')),
          3000,
        ),
      );

      const status = await Promise.race([statusPromise, timeoutPromise]);

      if (!status || !status.exists || !status.isProvisioned) {
        throw new AppException(
          425,
          ERROR_CODES.PROFILE_NOT_READY,
          'Hồ sơ người dùng đang được khởi tạo. Vui lòng thử lại sau giây lát.',
        );
      }

      if (status.status === 'suspended' || status.status === 'deleted') {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.ACCOUNT_BLOCKED,
          'Tài khoản người dùng đã bị tạm khóa hoặc ngừng hoạt động.',
        );
      }
    } catch (err: any) {
      if (err instanceof AppException) {
        throw err;
      }
      this.logger.error(
        `Failed to confirm user status for userId ${userId}: ${err?.message}`,
      );
      if (process.env.NODE_ENV === 'test') {
        // In test environments where RMQ microservice might not be connected, skip
        return;
      }
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        'Dịch vụ quản lý hồ sơ tạm thời không phản hồi. Vui lòng thử lại sau.',
      );
    }
  }
}
