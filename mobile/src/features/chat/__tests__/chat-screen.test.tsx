import type { ChatMessage } from '../types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { uploadChatMedia } from '../chat-media';
import { ChatScreen } from '../chat-screen';

const mockHeader = jest.fn();
const mockSend = jest.fn();
const mockType = jest.fn();
let mockConnected = true;
let mockCustomer = false;
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
    detail: { data: { customerId: 'customer', workerId: 'worker', customerName: 'Nguyễn Thị Mai', workerName: 'Trần Văn An', serviceName: 'Sửa máy lạnh', requestId: 'raw-request-id', permissions: { send: true }, readStates: [] }, refetch: jest.fn() },
    history: { data: { items: mockMessages }, refetch: jest.fn() },
    connected: mockConnected,
    send: mockSend,
    type: mockType,
    stopTyping: jest.fn(),
  }),
}));
jest.mock('../chat-media', () => ({ uploadChatMedia: jest.fn() }));
jest.mock('../chat-api', () => ({ ChatApi: { history: jest.fn() }, chatErrorMessage: () => 'Không gửi được tệp.' }));
jest.mock('../use-chat-keyboard', () => ({
  useChatKeyboard: () => ({ containerRef: { current: null }, bottomInset: 180, keyboardVisible: true, onLayout: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCustomer = false;
  mockConnected = true;
  mockMessages = [];
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
