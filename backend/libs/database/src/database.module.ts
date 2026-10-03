import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { AuthPrismaService } from './auth.prisma.service.js';
import { UserTrustPrismaService } from './user-trust.prisma.service.js';

@Module({
  providers: [AuthPrismaService],
  exports: [AuthPrismaService],
})
export class AuthDatabaseModule {}

@Module({
  providers: [UserTrustPrismaService],
  exports: [UserTrustPrismaService],
})
export class UserTrustDatabaseModule {}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}

