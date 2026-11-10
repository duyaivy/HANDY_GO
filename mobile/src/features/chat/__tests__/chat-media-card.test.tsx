import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

it('does not let an old URL refresh replace a newly selected attachment', async () => {
  let resolveRefresh!: (url: string) => void;
  const refresh = jest.fn(() => new Promise<string>((resolve) => {
    resolveRefresh = resolve;
  }));
  const view = render(<ChatMediaCard attachment={attachment} onOpen={jest.fn()} onRefresh={refresh} />);
  fireEvent(screen.getByTestId('chat-media-image-image'), 'error', { nativeEvent: { error: '403' } });
  const nextAttachment = { ...attachment, id: 'next-image', url: 'https://example.com/next.jpg' };
  view.rerender(<ChatMediaCard attachment={nextAttachment} onOpen={jest.fn()} onRefresh={refresh} />);
  await act(async () => {
    resolveRefresh('https://example.com/old-refreshed.jpg');
  });
  expect(screen.getByTestId('chat-media-image-next-image').props.source).toEqual(expect.arrayContaining([expect.objectContaining({ uri: nextAttachment.url })]));
});

it.each(['IMAGE', 'VIDEO'] as const)('handles unavailable %s without opening a missing URL and supports retry', async (mediaType) => {
  const open = jest.fn();
  const refresh = jest.fn().mockResolvedValue('https://example.com/recovered.jpg');
  render(<ChatMediaCard attachment={{ ...attachment, mediaType, unavailable: true, url: null }} onOpen={open} onRefresh={refresh} />);
  expect(screen.getByText('Tệp không khả dụng')).toBeTruthy();
  expect(screen.queryByTestId('chat-media-image-image')).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(mediaType === 'VIDEO' ? 'Xem video' : 'Xem ảnh'));
  expect(open).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Tải lại tệp'));
  await waitFor(() => expect(screen.queryByText('Tệp không khả dụng')).toBeNull());
  fireEvent.press(screen.getByLabelText(mediaType === 'VIDEO' ? 'Xem video' : 'Xem ảnh'));
  expect(open).toHaveBeenCalledTimes(1);
});
