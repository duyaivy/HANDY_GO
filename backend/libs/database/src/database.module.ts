import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { AuthPrismaService } from './auth.prisma.service.js';
import { UserTrustPrismaService } from './user-trust.prisma.service.js';
import { OrderPrismaService } from './order.prisma.service.js';
import { MatchingPrismaService } from './matching.prisma.service.js';

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
  providers: [OrderPrismaService],
  exports: [OrderPrismaService],
})
export class OrderDatabaseModule {}

@Module({
  providers: [MatchingPrismaService],
  exports: [MatchingPrismaService],
})
export class MatchingDatabaseModule {}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}

