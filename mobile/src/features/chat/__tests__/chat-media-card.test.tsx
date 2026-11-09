import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ChatMediaCard } from '../chat-media-card';

const attachment = { id: 'image', mediaType: 'IMAGE' as const, url: 'https://example.com/expired.jpg', width: 1200, height: 800 };

it('renews an expired private image URL once and renders the fresh image', async () => {
  const refresh = jest.fn().mockResolvedValue('https://example.com/fresh.jpg');
  render(<ChatMediaCard attachment={attachment} onOpen={jest.fn()} onRefresh={refresh} />);
  fireEvent(screen.getByTestId('chat-media-image-image'), 'error', { nativeEvent: { error: '403' } });
  await waitFor(() => expect(screen.getByTestId('chat-media-image-image').props.source).toEqual(expect.arrayContaining([expect.objectContaining({ uri: 'https://example.com/fresh.jpg' })])));
  expect(refresh).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByTestId('chat-media-image-image'), 'error', { nativeEvent: { error: 'offline' } });
  expect(await screen.findByLabelText('Tải lại ảnh')).toBeTruthy();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('shows an explicit retry action when the private image cannot be resolved', async () => {
  const refresh = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('https://example.com/retry.jpg');
  render(<ChatMediaCard attachment={attachment} onOpen={jest.fn()} onRefresh={refresh} />);
  fireEvent(screen.getByTestId('chat-media-image-image'), 'error', { nativeEvent: { error: '403' } });
  fireEvent.press(await screen.findByLabelText('Tải lại ảnh'));
  await waitFor(() => expect(screen.getByTestId('chat-media-image-image').props.source).toEqual(expect.arrayContaining([expect.objectContaining({ uri: 'https://example.com/retry.jpg' })])));
  expect(refresh).toHaveBeenCalledTimes(2);
});
