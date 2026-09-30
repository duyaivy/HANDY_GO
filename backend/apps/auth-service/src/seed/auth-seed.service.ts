import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import crypto from 'node:crypto';
import { AuthPrismaService } from '@app/database';
import { StandardPermissions } from '@app/auth';

@Injectable()
export class AuthSeedService implements OnModuleInit {
  private readonly logger = new Logger(AuthSeedService.name);

  constructor(private readonly db: AuthPrismaService) {}

  async onModuleInit(): Promise<void> {
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
      { code: 'CUSTOMER', name: 'Customer' },
      { code: 'WORKER', name: 'Worker' },
      { code: 'ADMIN', name: 'Admin' },
    ];

    const permissions = [
      { code: StandardPermissions.AUTH_ME, name: 'Xem tài khoản hiện tại', resource: 'auth', action: 'me' },
      { code: StandardPermissions.PROFILE_READ, name: 'Xem hồ sơ cá nhân', resource: 'profile', action: 'read' },
      { code: StandardPermissions.PROFILE_UPDATE, name: 'Cập nhật hồ sơ cá nhân', resource: 'profile', action: 'update' },
      { code: StandardPermissions.USER_READ, name: 'Xem người dùng hệ thống', resource: 'user', action: 'read' },
      { code: StandardPermissions.USER_MANAGE, name: 'Quản lý người dùng hệ thống', resource: 'user', action: 'manage' },
    ];

    // Seed permissions
    const permissionMap = new Map<string, string>();
    for (const perm of permissions) {
      const p = await this.db.permission.upsert({
        where: { code: perm.code },
        update: { name: perm.name, resource: perm.resource, action: perm.action },
        create: {
          id: crypto.randomUUID(),
          code: perm.code,
          name: perm.name,
          resource: perm.resource,
          action: perm.action,
          createdAt: new Date(),
        },
      });
      permissionMap.set(p.code, p.id);
    }

    // Seed roles
    const roleMap = new Map<string, string>();
    for (const role of roles) {
      const r = await this.db.role.upsert({
        where: { code: role.code },
        update: { name: role.name },
        create: {
          id: crypto.randomUUID(),
          code: role.code,
          name: role.name,
          createdAt: new Date(),
        },
      });
      roleMap.set(r.code, r.id);
    }

    // Link permissions to roles
    const rolePermissionMappings: Record<string, string[]> = {
      CUSTOMER: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
      ],
      WORKER: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
      ],
      ADMIN: [
        StandardPermissions.AUTH_ME,
        StandardPermissions.PROFILE_READ,
        StandardPermissions.PROFILE_UPDATE,
        StandardPermissions.USER_READ,
        StandardPermissions.USER_MANAGE,
      ],
    };

    for (const [roleCode, permCodes] of Object.entries(rolePermissionMappings)) {
      const roleId = roleMap.get(roleCode);
      if (!roleId) continue;

      for (const permCode of permCodes) {
        const permId = permissionMap.get(permCode);
        if (!permId) continue;

        await this.db.permissionRole.upsert({
          where: {
            permissionId_roleId: {
              permissionId: permId,
              roleId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId: permId,
            assignedAt: new Date(),
          },
        });
      }
    }

    this.logger.log('Auth roles and permissions seeded idempotently.');
  }
}
