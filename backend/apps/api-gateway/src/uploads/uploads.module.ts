import { ChatMediaController } from './chat-media.controller.js';
import { Module } from '@nestjs/common';
import { CloudinaryModule } from '@app/cloudinary';
import { UploadsController } from './uploads.controller.js';

@Module({
  imports: [CloudinaryModule],
  controllers: [UploadsController, ChatMediaController],
  exports: [CloudinaryModule],
})
export class UploadsModule {}
