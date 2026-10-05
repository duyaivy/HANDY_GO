export const CLOUDINARY_PROVIDER = 'CLOUDINARY_PROVIDER';
export const CLOUDINARY_API_BASE_URL = 'https://api.cloudinary.com/v1_1';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const MIN_CHUNK_SIZE_MB = 5;
