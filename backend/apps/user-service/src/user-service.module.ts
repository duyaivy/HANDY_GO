import { Module } from '@nestjs/common';
import { UserServiceController } from './user-service.controller.js';
import { UserServiceService } from './user-service.service.js';

@Module({
  imports: [],
  controllers: [UserServiceController],
  providers: [UserServiceService],
})
export class UserServiceModule {}
