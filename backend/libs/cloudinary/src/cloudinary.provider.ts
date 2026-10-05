import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@app/config';
import { CLOUDINARY_PROVIDER } from './cloudinary.constants.js';

export const CloudinaryProvider = {
  provide: CLOUDINARY_PROVIDER,
  useFactory: (configService: ConfigService) => {
    cloudinary.config({
      cloud_name: configService.cloudinaryCloudName,
      api_key: configService.cloudinaryApiKey,
      api_secret: configService.cloudinaryApiSecret,
      secure: true,
    });
    return cloudinary;
  },
  inject: [ConfigService],
};
