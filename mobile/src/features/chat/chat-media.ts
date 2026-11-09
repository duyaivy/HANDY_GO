import type { ImagePickerAsset } from 'expo-image-picker';
import type { ChatEnvelope } from './types';
import { ApiClient } from '@/services/api/api-client';

export async function uploadChatMedia(
  asset: ImagePickerAsset,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const video = asset.type === 'video';
  if (
    !asset.mimeType
    || (video
      ? !['video/mp4', 'video/quicktime', 'video/webm'].includes(asset.mimeType)
      : !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType))
  ) {
    throw new Error('Định dạng tệp chưa được hỗ trợ.');
  }
  const cap = (video ? 100 : 10) * 1024 * 1024;
  if (!asset.fileSize || asset.fileSize > cap)
    throw new Error(video ? 'Video tối đa 100 MB.' : 'Ảnh tối đa 10 MB.');
  if (!video) {
    const form = new FormData();
    form.append('intent', 'chat');
    form.append('file', {
      uri: asset.uri,
      name: asset.fileName || 'chat.jpg',
      type: asset.mimeType,
    } as unknown as Blob);
    const result = await ApiClient.post<ChatEnvelope<{ publicId: string }>>(
      '/uploads/image',
      form,
      {
        signal,
        onUploadProgress: (event) => {
          if (event.total)
            onProgress(Math.round((event.loaded / event.total) * 100));
        },
      },
    );
    if (!result.data.publicId)
      throw new Error('Chưa tải được tệp riêng tư.');
    return result.data.publicId;
  }
  const init = (
    await ApiClient.post<
      ChatEnvelope<{
        uploadId: string;
        apiKey: string;
        timestamp: number;
        signature: string;
        publicId: string;
        folder?: string;
        uploadUrl: string;
        chunkSize: number;
        type: string;
        context: string;
        overwrite: boolean;
      }>
    >(
      '/uploads/video/init',
      {
        intent: 'chat',
        fileName: asset.fileName || 'chat.mp4',
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
      },
      { signal },
    )
  ).data;
  if (
    init.type !== 'authenticated'
    || !init.context
    || init.overwrite !== false
    || !/^https:\/\/api\.cloudinary\.com\//.test(init.uploadUrl)
  ) {
    throw new Error('Không thể xác minh phiên tải video riêng tư.');
  }
  // Chat videos are capped at 100 MB, so Cloudinary's regular upload is
  // sufficient. Native multipart requires a URI-backed file, not a Blob slice.
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.fileName || 'chat.mp4',
    type: asset.mimeType,
  } as unknown as Blob);
  for (const [key, value] of Object.entries({
    api_key: init.apiKey,
    timestamp: init.timestamp,
    signature: init.signature,
    public_id: init.publicId,
    ...(init.folder ? { folder: init.folder } : {}),
    type: init.type,
    context: init.context,
    overwrite: init.overwrite,
  }))
    form.append(key, String(value));
  const response = await fetch(init.uploadUrl, {
    method: 'POST',
    body: form,
    signal,
  });
  if (!response.ok)
    throw new Error('Tải video thất bại. Vui lòng thử lại.');
  const result = await response.json();
  if (
    result.public_id !== init.publicId
    || result.resource_type !== 'video'
    || result.type !== 'authenticated'
  ) {
    throw new Error('Video chưa hoàn tất tải lên.');
  }
  onProgress(100);
  return init.publicId;
}
