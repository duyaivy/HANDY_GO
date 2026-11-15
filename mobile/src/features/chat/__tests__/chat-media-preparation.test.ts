import type { ImagePickerAsset } from 'expo-image-picker';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getVideoMetaData, Video } from 'react-native-compressor';
import { prepareChatMedia } from '../chat-media-preparation';

const mockDelete = jest.fn();
const mockSizes: Record<string, number> = {};
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get size() { return mockSizes[uri] ?? 0; },
    exists: true,
    delete: () => mockDelete(uri),
  })),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('react-native-compressor', () => ({
  Video: { compress: jest.fn(), cancelCompression: jest.fn() },
  getVideoMetaData: jest.fn(),
}));

const photo: ImagePickerAsset = { uri: 'file:///original.jpg', type: 'image', mimeType: 'image/jpeg', width: 4000, height: 3000, fileSize: 900000 };
const video: ImagePickerAsset = { ...photo, uri: 'file:///original.mov', type: 'video', mimeType: 'video/quicktime', width: 1920, height: 1080, fileSize: 9000000 };
beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockSizes)) delete mockSizes[key];
  mockSizes[photo.uri] = 900000;
  mockSizes[video.uri] = 9000000;
  mockSizes['file:///compressed.jpg'] = 200000;
  mockSizes['file:///compressed.mp4'] = 2000000;
  jest.mocked(manipulateAsync).mockResolvedValue({ uri: 'file:///compressed.jpg', width: 1600, height: 1200 });
  jest.mocked(Video.compress).mockResolvedValue('file:///compressed.mp4');
  jest.mocked(getVideoMetaData).mockResolvedValue({ width: 1280, height: 720, duration: 8, size: 2000000, extension: 'mp4' });
});

it('resizes a landscape photo, uploads actual JPEG bytes and releases only the temporary file', async () => {
  const result = await prepareChatMedia(photo);
  expect(manipulateAsync).toHaveBeenCalledWith(photo.uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
  expect(result.asset).toMatchObject({ uri: 'file:///compressed.jpg', fileSize: 200000, mimeType: 'image/jpeg', width: 1600, height: 1200, fileName: 'chat.jpg' });
  expect(mockDelete).not.toHaveBeenCalled();
  result.cleanup();
  result.cleanup();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.jpg');
});
it('resizes portrait images by height without enlarging smaller photos', async () => {
  await prepareChatMedia({ ...photo, width: 3000, height: 4000 });
  expect(manipulateAsync).toHaveBeenLastCalledWith(photo.uri, [{ resize: { height: 1600 } }], expect.anything());
  await prepareChatMedia({ ...photo, width: 800, height: 600 });
  expect(manipulateAsync).toHaveBeenLastCalledWith(photo.uri, [], expect.anything());
});
it.each([['image/png', 'png'], ['image/webp', 'webp']])('preserves transparency for %s', async (mimeType, format) => {
  await prepareChatMedia({ ...photo, mimeType });
  expect(manipulateAsync).toHaveBeenCalledWith(photo.uri, expect.anything(), { compress: 0.8, format });
});
it('keeps a smaller original photo and deletes an unhelpful encoded result', async () => {
  mockSizes[photo.uri] = 100000;
  const result = await prepareChatMedia({ ...photo, width: 800, height: 600 });
  expect(result.asset.uri).toBe(photo.uri);
  expect(result.asset.fileSize).toBe(100000);
  result.cleanup();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalledWith(photo.uri);
});
it('skips native video loading/compression for files at or below 5 MiB', async () => {
  mockSizes[video.uri] = 5 * 1024 * 1024;
  const result = await prepareChatMedia(video);
  expect(result.asset.fileSize).toBe(5 * 1024 * 1024);
  expect(Video.compress).not.toHaveBeenCalled();
});
it('compresses video to 720p landscape at 2 Mbps and reads actual resulting metadata', async () => {
  const result = await prepareChatMedia(video);
  expect(Video.compress).toHaveBeenCalledWith(video.uri, expect.objectContaining({ compressionMethod: 'manual', maxSize: 1280, bitrate: 2000000, minimumFileSizeForCompress: 0 }), expect.any(Function));
  expect(result.asset).toMatchObject({ uri: 'file:///compressed.mp4', mimeType: 'video/mp4', fileName: 'chat.mp4', fileSize: 2000000, width: 1280, height: 720, duration: 8000 });
  result.cleanup();
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.mp4');
});
it('preserves a smaller original video', async () => {
  mockSizes['file:///compressed.mp4'] = 10000000;
  const result = await prepareChatMedia(video);
  expect(result.asset.uri).toBe(video.uri);
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.mp4');
});
it('does not delete source files when the codec returns the original URI', async () => {
  jest.mocked(Video.compress).mockResolvedValue(video.uri);
  const result = await prepareChatMedia(video);
  result.cleanup();
  expect(result.asset.uri).toBe(video.uri);
  expect(mockDelete).not.toHaveBeenCalled();
});
it('does no processing when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(prepareChatMedia(photo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(File).not.toHaveBeenCalled();
  expect(manipulateAsync).not.toHaveBeenCalled();
});
it('deletes image output and prevents upload when cancelled during encoding', async () => {
  const controller = new AbortController();
  jest.mocked(manipulateAsync).mockImplementation(async () => {
    controller.abort();
    return { uri: 'file:///compressed.jpg', width: 1600, height: 1200 };
  });
  await expect(prepareChatMedia(photo, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.jpg');
});
it('cancels native compression and removes its output when cancelled mid-video', async () => {
  const controller = new AbortController();
  jest.mocked(Video.compress).mockImplementation(async (_uri, options) => {
    options!.getCancellationId!('job-1');
    controller.abort();
    return 'file:///compressed.mp4';
  });
  await expect(prepareChatMedia(video, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(Video.cancelCompression).toHaveBeenCalledWith('job-1');
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.mp4');
});
it('removes video output when reading metadata fails', async () => {
  jest.mocked(getVideoMetaData).mockRejectedValue(new Error('invalid codec output'));
  await expect(prepareChatMedia(video)).rejects.toThrow();
  expect(mockDelete).toHaveBeenCalledWith('file:///compressed.mp4');
});
it('rejects missing or empty local files', async () => {
  mockSizes[photo.uri] = 0;
  await expect(prepareChatMedia(photo)).rejects.toThrow();
  expect(manipulateAsync).not.toHaveBeenCalled();
});

it('returns AbortError when the native codec rejects cancellation without an output URI', async () => {
  const controller = new AbortController();
  jest.mocked(Video.compress).mockImplementation(async (_uri, options) => {
    options!.getCancellationId!('rejected-job');
    controller.abort();
    throw new Error('compression has been cancelled');
  });
  await expect(prepareChatMedia(video, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(Video.cancelCompression).toHaveBeenCalledWith('rejected-job');
  expect(mockDelete).not.toHaveBeenCalledWith(video.uri);
});
