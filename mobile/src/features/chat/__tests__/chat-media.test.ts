import type { ImagePickerAsset } from 'expo-image-picker';
import { ApiClient } from '@/services/api/api-client';
import { uploadChatMedia } from '../chat-media';
import { prepareChatMedia } from '../chat-media-preparation';

const mockCleanup = jest.fn();
jest.mock('../chat-media-preparation', () => ({ prepareChatMedia: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prepareChatMedia).mockImplementation(async asset => ({ asset, cleanup: mockCleanup }));
});

jest.mock('@/services/api/api-client', () => ({
  ApiClient: { post: jest.fn() },
}));
const asset: ImagePickerAsset = {
  uri: 'file:///photo.jpg',
  width: 100,
  height: 100,
  type: 'image',
  mimeType: 'image/jpeg',
  fileSize: 1000,
};
it('uploads through existing API with chat intent and sends only trusted storage key', async () => {
  (ApiClient.post as jest.Mock).mockResolvedValue({
    data: {
      publicId: 'handy-go/chat/private',
      url: 'https://public.invalid/ignored',
    },
  });
  await expect(uploadChatMedia(asset, () => {})).resolves.toBe(
    'handy-go/chat/private',
  );
  const [url, form] = (ApiClient.post as jest.Mock).mock.calls[0];
  expect(url).toBe('/uploads/image');
  expect(form.get('intent')).toBe('chat');
});
it('rejects public-only response and unsupported or oversized files', async () => {
  (ApiClient.post as jest.Mock).mockResolvedValue({
    data: { url: 'https://public.invalid' },
  });
  await expect(uploadChatMedia(asset, () => {})).rejects.toThrow();
  await expect(
    uploadChatMedia({ ...asset, mimeType: 'image/svg+xml' }, () => {}),
  ).rejects.toThrow();
  await expect(
    uploadChatMedia({ ...asset, fileSize: 11 * 1024 * 1024 }, () => {}),
  ).rejects.toThrow();
});

describe('native signed video upload', () => {
  const video: ImagePickerAsset = {
    ...asset,
    uri: 'file:///gallery/video.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    fileName: 'video.mp4',
  };
  const receipt = {
    public_id: 'handy-go/chat/videos/private',
    resource_type: 'video',
    type: 'authenticated',
  };
  const originalFetch = global.fetch;
  const originalFormData = global.FormData;
  let uploadedForm: FormData;
  beforeEach(() => {
    global.FormData = jest.requireActual('react-native/Libraries/Network/FormData').default;
    (ApiClient.post as jest.Mock).mockResolvedValue({
      data: {
        uploadId: 'upload-id',
        apiKey: 'key',
        timestamp: 123,
        signature: 'signed',
        publicId: receipt.public_id,
        folder: '',
        uploadUrl: 'https://api.cloudinary.com/v1_1/cloud/video/upload',
        chunkSize: 20 * 1024 * 1024,
        type: 'authenticated',
        context: 'chat_owner=owner|chat_intent=chat|chat_proof=proof',
        overwrite: false,
      },
    });
    global.fetch = jest.fn(async (url, options) => {
      if (url === video.uri)
        return { blob: async () => new Blob(['x'.repeat(1000)]) } as Response;
      uploadedForm = options!.body as FormData;
      // Native multipart networking only accepts binary parts backed by a URI.
      const file = uploadedForm.getAll('file')[0] as unknown as { uri?: string };
      if (typeof file.uri !== 'string')
        throw new Error('Unrecognized FormData part.');
      return { ok: true, json: async () => receipt } as Response;
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    global.FormData = originalFormData;
  });

  it('uploads the gallery URI as native multipart with signed private parameters', async () => {
    const progress = jest.fn();
    await expect(uploadChatMedia(video, progress)).resolves.toBe(receipt.public_id);
    expect(uploadedForm.getAll('file')[0]).toEqual({
      uri: video.uri,
      name: 'video.mp4',
      type: 'video/mp4',
    });
    expect(uploadedForm.getAll('signature')[0]).toBe('signed');
    expect(uploadedForm.getAll('context')[0]).toContain('chat_proof=proof');
    expect(uploadedForm.getAll('overwrite')[0]).toBe('false');
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it('signs and uploads the prepared MP4 metadata rather than original MOV metadata', async () => {
    jest.mocked(prepareChatMedia).mockResolvedValueOnce({ asset: { ...video, uri: 'file:///optimized.mp4', mimeType: 'video/mp4', fileName: 'chat.mp4', fileSize: 700 }, cleanup: mockCleanup });
    await uploadChatMedia({ ...video, mimeType: 'video/quicktime', fileName: 'original.mov' }, () => {});
    expect(ApiClient.post).toHaveBeenCalledWith('/uploads/video/init', { intent: 'chat', fileName: 'chat.mp4', fileSize: 700, mimeType: 'video/mp4' }, expect.anything());
    expect(uploadedForm.getAll('file')[0]).toMatchObject({ uri: 'file:///optimized.mp4', name: 'chat.mp4', type: 'video/mp4' });
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...receipt, public_id: 'other/video' },
    { ...receipt, resource_type: 'image' },
    { ...receipt, type: 'upload' },
  ])('rejects an upload receipt for the wrong asset or delivery type', async (result) => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => result,
    } as Response)) as typeof fetch;
    await expect(uploadChatMedia(video, () => {})).rejects.toThrow();
  });
});

describe('prepared upload lifecycle', () => {
  const originalFormData = global.FormData;
  beforeEach(() => {
    global.FormData = jest.requireActual('react-native/Libraries/Network/FormData').default;
  });
  afterEach(() => {
    global.FormData = originalFormData;
  });
  it('uploads optimized image URI and cleans it after the server responds', async () => {
    jest.mocked(prepareChatMedia).mockResolvedValueOnce({ asset: { ...asset, uri: 'file:///optimized.jpg', fileName: 'chat.jpg', fileSize: 500 }, cleanup: mockCleanup });
    jest.mocked(ApiClient.post).mockResolvedValueOnce({ data: { publicId: 'chat/image' } });
    await uploadChatMedia(asset, () => {});
    const form = jest.mocked(ApiClient.post).mock.calls.at(-1)![1] as FormData;
    expect(form.getAll('file')[0]).toMatchObject({ uri: 'file:///optimized.jpg', type: 'image/jpeg', name: 'chat.jpg' });
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
  it('validates compressed size instead of rejecting a large source before preparation', async () => {
    jest.mocked(prepareChatMedia).mockResolvedValueOnce({ asset: { ...asset, fileSize: 500 }, cleanup: mockCleanup });
    jest.mocked(ApiClient.post).mockResolvedValueOnce({ data: { publicId: 'chat/image' } });
    await expect(uploadChatMedia({ ...asset, fileSize: 12 * 1024 * 1024 }, () => {})).resolves.toBe('chat/image');
  });
  it('cleans output when the prepared image is still oversized', async () => {
    jest.mocked(prepareChatMedia).mockResolvedValueOnce({ asset: { ...asset, fileSize: 11 * 1024 * 1024 }, cleanup: mockCleanup });
    await expect(uploadChatMedia(asset, () => {})).rejects.toThrow('10 MB');
    expect(ApiClient.post).not.toHaveBeenCalled();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
  it('cleans output when upload fails', async () => {
    jest.mocked(ApiClient.post).mockRejectedValueOnce(new Error('network unavailable'));
    await expect(uploadChatMedia(asset, () => {})).rejects.toThrow('network unavailable');
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
  it('does not start upload after preparation was cancelled', async () => {
    const controller = new AbortController();
    jest.mocked(prepareChatMedia).mockImplementationOnce(async () => {
      controller.abort();
      return { asset, cleanup: mockCleanup };
    });
    await expect(uploadChatMedia(asset, () => {}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(ApiClient.post).not.toHaveBeenCalled();
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
});
