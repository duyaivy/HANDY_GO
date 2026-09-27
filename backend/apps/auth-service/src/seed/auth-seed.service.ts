import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { StandardPermissions } from '@app/auth';

@Injectable()
export class AuthSeedService implements OnModuleInit {
  private readonly logger = new Logger(AuthSeedService.name);

  constructor(private readonly db: AuthPrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      await this.seed();
      this.logger.log('Auth seed completed successfully.');
    } catch (error) {
      this.logger.error(`Auth seed failed: ${(error as Error).message}`);
      throw new Error(`Auth seed failed: ${(error as Error).message}`);
    }
  }

  async seed(): Promise<void> {
    const roles = [
      { name: 'Customer', description: 'Khách hàng sử dụng dịch vụ tiện ích' },
      { name: 'Worker', description: 'Thợ cung cấp dịch vụ đã được KYC phê duyệt' },
      { name: 'Admin', description: 'Quản trị viên hệ thống' },
    ];

    const permissions = [
      { code: StandardPermissions.AUTH_ME, description: 'Xem thông tin tài khoản hiện tại' },
      { code: StandardPermissions.PROFILE_READ, description: 'Xem hồ sơ cá nhân' },
      { code: StandardPermissions.PROFILE_UPDATE, description: 'Cập nhật hồ sơ cá nhân' },
      { code: StandardPermissions.USER_READ, description: 'Xem danh sách người dùng hệ thống' },
      { code: StandardPermissions.USER_MANAGE, description: 'Quản lý người dùng hệ thống' },
    ];

    // Seed permissions
    const permissionMap = new Map<string, string>();
    for (const perm of permissions) {
      const p = await this.db.permission.upsert({
        where: { code: perm.code },
        update: { description: perm.description },
        create: { code: perm.code, description: perm.description },
      });
      permissionMap.set(p.code, p.id);
    }

    // Seed roles
    const roleMap = new Map<string, string>();
    for (const role of roles) {
      const r = await this.db.role.upsert({
        where: { name: role.name },
        update: { description: role.description },
        create: { name: role.name, description: role.description },
      });
      roleMap.set(r.name, r.id);
    }

    // Link permissions to roles
    const rolePermissionMappings: Record<string, string[]> = {
      Customer: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
      ],
      Worker: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
      ],
      Admin: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
        StandardPermissions.USER_READ,
        StandardPermissions.USER_MANAGE,
      ],
    };

    for (const [roleName, permCodes] of Object.entries(rolePermissionMappings)) {
      const roleId = roleMap.get(roleName);
      if (!roleId) continue;

      for (const permCode of permCodes) {
        const permId = permissionMap.get(permCode);
        if (!permId) continue;

        await this.db.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId: permId,
          },
        });
      }
    }

    this.logger.log('Auth roles and permissions seeded idempotently.');
  }
}
