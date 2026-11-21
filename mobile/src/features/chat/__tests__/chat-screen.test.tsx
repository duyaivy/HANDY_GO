import type { ChatMessage } from '../types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { uploadChatMedia } from '../chat-media';
import { ChatScreen } from '../chat-screen';

const mockHeader = jest.fn();
const mockSend = jest.fn();
const mockType = jest.fn();
const mockDetailRefetch = jest.fn();
const mockHistoryRefetch = jest.fn();
const mockChatRefresh = jest.fn();
let mockConnected = true;
let mockCustomer = false;
let mockChatError = false;
let mockChatPending = false;
let mockMessages: ChatMessage[] = [];
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 72 }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'client-message-id' }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'conversation', name: 'Tên cũ' }),
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) => {
      mockHeader(options);
      return options.headerRight?.() ?? null;
    },
  },
}));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: mockCustomer ? 'customer' : 'worker' },
  }),
}));
jest.mock('../use-chat', () => ({
  useChat: () => ({
    detail: {
      data: { customerId: 'customer', workerId: 'worker', customerName: 'Nguyễn Thị Mai', workerName: 'Trần Văn An', serviceName: 'Sửa máy lạnh', requestId: 'raw-request-id', permissions: { send: true }, readStates: [] },
      refetch: mockDetailRefetch,
      isError: mockChatError,
    },
    history: {
      data: { items: mockMessages },
      refetch: mockHistoryRefetch,
      isError: false,
      isPending: mockChatPending,
    },
    connected: mockConnected,
    send: mockSend,
    type: mockType,
    stopTyping: jest.fn(),
    refresh: mockChatRefresh,
    syncError: false,
  }),
}));
jest.mock('../chat-media', () => ({ uploadChatMedia: jest.fn() }));
jest.mock('../chat-deal-bar', () => ({
  ChatDealBar: ({ _conversation, userId }: any) => {
    const { Text, View } = require('react-native');
    return (
      <View testID="mock-chat-deal-bar">
        <Text>{`DealBar: ${userId}`}</Text>
      </View>
    );
  },
}));
jest.mock('../chat-api', () => ({ ChatApi: { history: jest.fn() }, chatErrorMessage: () => 'Không gửi được tệp.' }));
jest.mock('../use-chat-keyboard', () => ({
  useChatKeyboard: () => ({ containerRef: { current: null }, bottomInset: 180, keyboardVisible: true, onLayout: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCustomer = false;
  mockConnected = true;
  mockChatError = false;
  mockChatPending = false;
  mockMessages = [];
  mockDetailRefetch.mockResolvedValue({});
  mockHistoryRefetch.mockResolvedValue({});
  mockChatRefresh.mockResolvedValue({});
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

it.each([false, true])('centers the actual counterpart name for customer=%s and shows the service title', (customer) => {
  mockCustomer = customer;
  render(<ChatScreen />);
  expect(mockHeader).toHaveBeenLastCalledWith(expect.objectContaining({
    title: customer ? 'Trần Văn An' : 'Nguyễn Thị Mai',
    headerTitleAlign: 'center',
  }));
  expect(screen.getByText('Yêu cầu Sửa máy lạnh')).toBeTruthy();
  expect(screen.queryByText(/raw-request-id/)).toBeNull();
  expect(screen.getByLabelText('Chat đã kết nối')).toBeTruthy();
  expect(screen.queryByText('Đã kết nối')).toBeNull();
});

it.each(['android', 'ios'])('applies the measured keyboard overlap on %s', (os) => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  render(<ChatScreen />);
  expect(screen.getByTestId('chat-keyboard-content')).toHaveStyle({ paddingBottom: 180 });
});

it('shows only a text status while a message is being sent', async () => {
  mockSend.mockReturnValue(new Promise(() => {}));
  const view = render(<ChatScreen />);
  fireEvent.changeText(screen.getByLabelText('Nội dung tin nhắn'), 'Đang thử gửi');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  expect(await screen.findByText('Đang gửi…')).toBeTruthy();
  expect(view.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
});

it('also uses text without a spinner for an outgoing image', async () => {
  jest.mocked(uploadChatMedia).mockResolvedValue('chat/images/private-image');
  mockSend.mockReturnValue(new Promise(() => {}));
  const view = render(<ChatScreen />);
  fireEvent.press(screen.getByLabelText('Đính kèm ảnh hoặc video'));
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  options?.find(option => option.text === 'Chụp ảnh ngay')?.onPress?.();
  await screen.findByLabelText('Xem trước ảnh đã chọn');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  expect(await screen.findByText('Đang gửi…')).toBeTruthy();
  expect(view.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
});

it('opens the photo library, not the legacy file picker', async () => {
  render(<ChatScreen />);
  fireEvent.press(screen.getByLabelText('Đính kèm ảnh hoặc video'));
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  expect(options?.map(option => option.text)).toEqual(['Chụp ảnh ngay', 'Chọn từ thư viện ảnh', 'Hủy']);
  options?.find(option => option.text === 'Chọn từ thư viện ảnh')?.onPress?.();
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
    legacy: false,
    mediaTypes: ['images', 'videos'],
  })));
});

it('offers camera capture and shows a removable thumbnail before sending', async () => {
  render(<ChatScreen />);
  fireEvent.press(screen.getByLabelText('Đính kèm ảnh hoặc video'));
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  options?.find(option => option.text === 'Chụp ảnh ngay')?.onPress?.();
  await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] })));
  expect(await screen.findByLabelText('Xem trước ảnh đã chọn')).toBeTruthy();
  expect(mockSend).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Bỏ tệp đã chọn'));
  expect(screen.queryByLabelText('Xem trước ảnh đã chọn')).toBeNull();
});

it('renders image messages as standalone media cards with overlaid delivery status', () => {
  mockMessages = [{
    id: 'photo-message',
    conversationId: 'conversation',
    senderId: 'worker',
    clientMessageId: 'photo-client',
    sequence: '1',
    messageType: 'IMAGE',
    content: null,
    replyToId: null,
    reply: null,
    createdAt: new Date().toISOString(),
    attachments: [{ id: 'attachment', storageKey: 'chat/image', mediaType: 'IMAGE', mimeType: 'image/jpeg', sizeBytes: 100, position: 0, width: 1200, height: 800, durationMs: null, url: 'https://example.com/image.jpg', urlExpiresAt: new Date(Date.now() + 300000).toISOString() }],
  }];
  render(<ChatScreen />);
  expect(screen.getByTestId('chat-media-message-photo-message')).toHaveStyle({ padding: 0, backgroundColor: 'transparent' });
  expect(screen.getByTestId('chat-media-image-attachment')).toHaveStyle({ aspectRatio: 1.5 });
  expect(screen.getByTestId('chat-media-meta-photo-message')).toHaveStyle({ position: 'absolute' });
});

it('sends typed text through an accessible icon button and clears the draft', async () => {
  mockSend.mockResolvedValue({});
  render(<ChatScreen />);
  expect(screen.queryByText('Gửi')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Nội dung tin nhắn'), 'Xin chào khách');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Xin chào khách',
    messageType: 'TEXT',
    conversationId: 'conversation',
  })));
  expect(screen.getByLabelText('Nội dung tin nhắn').props.value).toBe('');
});

it('shows preparation separately from uploading and lets the user cancel compression', async () => {
  let uploadSignal: AbortSignal | undefined;
  jest.mocked(uploadChatMedia).mockImplementationOnce((_asset, _progress, options) => {
    uploadSignal = options?.signal;
    options?.onPreparation?.({ phase: 'compressing', percent: 42 });
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  });
  render(<ChatScreen />);
  fireEvent.press(screen.getByLabelText('Đính kèm ảnh hoặc video'));
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  options?.find(option => option.text === 'Chụp ảnh ngay')?.onPress?.();
  await screen.findByLabelText('Xem trước ảnh đã chọn');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  expect(await screen.findByText(/Đang nén video 42%/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Hủy tải tệp'));
  await waitFor(() => expect(screen.queryByText(/Đang nén video 42%/)).toBeNull());
  expect(uploadSignal?.aborted).toBe(true);
  expect(mockSend).not.toHaveBeenCalled();
});

it('renders ChatDealBar negotiation banner when conversation data is available', () => {
  render(<ChatScreen />);
  expect(screen.getByTestId('mock-chat-deal-bar')).toBeTruthy();
  expect(screen.getByText('DealBar: worker')).toBeTruthy();
});

it('renders error banner above chat messages (below deal bar), not inside service title container', async () => {
  mockChatError = true;
  render(<ChatScreen />);

  const errorBanner = screen.getByTestId('chat-error-banner');
  expect(errorBanner).toBeTruthy();
  expect(screen.getByText('Không tải được trò chuyện. Chạm để thử lại.')).toBeTruthy();

  fireEvent.press(errorBanner);
  await waitFor(() => {
    expect(mockDetailRefetch).toHaveBeenCalled();
    expect(mockHistoryRefetch).toHaveBeenCalled();
    expect(mockChatRefresh).toHaveBeenCalled();
  });
});

it('supports pull-to-refresh to reload chat and conversation details', async () => {
  render(<ChatScreen />);

  const flatList = screen.getByTestId('chat-messages-list');
  expect(flatList.props.refreshControl).toBeDefined();

  fireEvent(flatList, 'onRefresh');
  await waitFor(() => {
    expect(mockDetailRefetch).toHaveBeenCalled();
    expect(mockHistoryRefetch).toHaveBeenCalled();
    expect(mockChatRefresh).toHaveBeenCalled();
  });
});

it('supports downward swipe gesture to refresh conversation', async () => {
  render(<ChatScreen />);
  const container = screen.getByTestId('chat-messages-container');
  expect(container.props.onMoveShouldSetResponder).toBeDefined();
  expect(container.props.onResponderRelease).toBeDefined();
});

it('renders empty chat placeholder right-side up without an inverted transform', () => {
  mockMessages = [];
  render(<ChatScreen />);
  const emptyText = screen.getByText('Hãy bắt đầu trao đổi về yêu cầu dịch vụ.');
  expect(emptyText).toBeTruthy();
  expect(emptyText.props.style).not.toEqual(
    expect.objectContaining({
      transform: [{ scaleY: -1 }],
    }),
  );
});

it('ensures empty container receives inversion transform so placeholder displays right-side up in inverted FlatList', () => {
  mockMessages = [];
  render(<ChatScreen />);
  const emptyContainer = screen.getByTestId('chat-empty-placeholder-container');
  expect(emptyContainer.props.style).toEqual(
    expect.objectContaining({
      transform: [{ scaleY: -1 }],
    }),
  );
});
