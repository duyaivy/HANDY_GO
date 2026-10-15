import { Module } from '@nestjs/common';
import { CloudinaryModule } from '@app/cloudinary';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [CloudinaryModule],
  controllers: [UploadsController],
  exports: [CloudinaryModule],
})
export class UploadsModule {}
