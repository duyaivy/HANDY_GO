import type { ImagePickerAsset } from 'expo-image-picker';
import type * as NativeCompressor from 'react-native-compressor';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type MediaPreparationProgress = { phase: 'preparing' | 'compressing'; percent?: number };

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Đã hủy chuẩn bị tệp.');
    error.name = 'AbortError';
    throw error;
  }
}

function fileSize(uri: string) {
  const size = new File(uri).size;
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error('Không đọc được dung lượng tệp. Vui lòng chọn lại.');
  return size;
}

/** Owns only the output it creates; gallery/camera originals must never be deleted. */
export async function prepareChatMedia(
  original: ImagePickerAsset,
  signal?: AbortSignal,
  onProgress?: (progress: MediaPreparationProgress) => void,
): Promise<{ asset: ImagePickerAsset; cleanup: () => void }> {
  checkCancelled(signal);
  const source = { ...original, fileSize: fileSize(original.uri) };
  let temporaryUri: string | undefined;
  const cleanup = () => {
    const uri = temporaryUri;
    temporaryUri = undefined;
    if (uri && uri !== original.uri) {
      try {
        const file = new File(uri);
        if (file.exists)
          file.delete();
      }
      catch { /* Cache cleanup must not turn a successful upload into a retry. */ }
    }
  };

  try {
    onProgress?.({ phase: 'preparing' });
    let asset: ImagePickerAsset;
    if (source.type === 'video') {
      if (source.fileSize <= 5 * 1024 * 1024)
        return { asset: source, cleanup };
      // Load the native codec only for videos that actually need compression.
      const { Video, getVideoMetaData } = require('react-native-compressor') as typeof NativeCompressor;
      checkCancelled(signal);
      let cancellationId: string | undefined;
      const cancel = () => {
        if (cancellationId)
          Video.cancelCompression(cancellationId);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        onProgress?.({ phase: 'compressing', percent: 0 });
        const uri = await Video.compress(source.uri, {
          compressionMethod: 'manual',
          maxSize: 1280,
          bitrate: 2000000,
          minimumFileSizeForCompress: 0,
          stripAudio: false,
          getCancellationId: (id) => {
            checkCancelled(signal);
            cancellationId = id;
          },
        }, (progress) => {
          if (!signal?.aborted)
            onProgress?.({ phase: 'compressing', percent: Math.round(Math.max(0, Math.min(1, progress)) * 100) });
        });
        if (uri !== source.uri)
          temporaryUri = uri;
        checkCancelled(signal);
        const size = fileSize(uri);
        if (size >= source.fileSize || uri === source.uri) {
          cleanup();
          return { asset: source, cleanup };
        }
        const metadata = await getVideoMetaData(uri);
        checkCancelled(signal);
        if (!(metadata.width > 0 && metadata.height > 0 && metadata.duration > 0))
          throw new Error('Không đọc được thông tin video sau khi nén.');
        asset = {
          ...source,
          uri,
          fileSize: size,
          mimeType: 'video/mp4',
          fileName: 'chat.mp4',
          width: metadata.width,
          height: metadata.height,
          duration: metadata.duration * 1000,
        };
      }
      finally {
        signal?.removeEventListener('abort', cancel);
      }
    }
    else {
      if (!(source.width > 0 && source.height > 0))
        throw new Error('Kích thước ảnh không hợp lệ.');
      const resize = Math.max(source.width, source.height) > 1600;
      const actions = resize
        ? [{ resize: source.width >= source.height ? { width: 1600 } : { height: 1600 } }]
        : [];
      // PNG/WebP can contain transparency, so retain their format.
      const format = source.mimeType === 'image/png' ? SaveFormat.PNG : source.mimeType === 'image/webp' ? SaveFormat.WEBP : SaveFormat.JPEG;
      const extension = format === SaveFormat.JPEG ? 'jpg' : format;
      const result = await manipulateAsync(source.uri, actions, { compress: 0.8, format });
      if (result.uri !== source.uri)
        temporaryUri = result.uri;
      checkCancelled(signal);
      const size = fileSize(result.uri);
      if (size >= source.fileSize && !resize) {
        cleanup();
        return { asset: source, cleanup };
      }
      asset = {
        ...source,
        uri: result.uri,
        width: result.width,
        height: result.height,
        fileSize: size,
        mimeType: `image/${format === SaveFormat.JPEG ? 'jpeg' : format}`,
        fileName: `chat.${extension}`,
      };
    }
    checkCancelled(signal);
    return { asset, cleanup };
  }
  catch (error) {
    cleanup();
    checkCancelled(signal);
    throw error;
  }
}
