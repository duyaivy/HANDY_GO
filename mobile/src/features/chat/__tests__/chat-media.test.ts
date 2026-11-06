import type { ImagePickerAsset } from 'expo-image-picker';
import { ApiClient } from '@/services/api/api-client';
import { uploadChatMedia } from '../chat-media';

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
