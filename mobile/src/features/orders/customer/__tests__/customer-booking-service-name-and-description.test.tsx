import * as React from 'react';
import { BackHandler, Keyboard, TextInput } from 'react-native';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { useBookingDraftStore } from '../../stores/use-booking-draft-store';
import { CustomerBookingScreen } from '../screens/customer-booking-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

const initialAuthState = useAuthStore.getState();

afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
  useBookingDraftStore.getState().resetDraft();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('customerBookingScreen - Service Name Preservation and Dynamic Service Issue Suggestions (TASK-06 & HG-95)', () => {
  it('dismisses a focused input before navigating back so hiding the keyboard preserves the draft', () => {
    const listener = jest.spyOn(BackHandler, 'addEventListener');
    const blur = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({ blur } as unknown as TextInput);
    render(<CustomerBookingScreen serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f" />);
    fireEvent.changeText(screen.getByTestId('booking-description-input'), 'HG71 sandbox request');
    const back = listener.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
    expect(back?.()).toBe(true);
    expect(blur).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useBookingDraftStore.getState().description).toBe('HG71 sandbox request');
  });

  it('preserves specific serviceName and renders service-specific suggestion chips expanded by default', () => {
    useAuthStore.setState({ isAuthenticated: true });

    // Render with Sửa máy giặt UUID
    render(
      <CustomerBookingScreen
        serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"
      />,
    );

    // Should display Sửa máy giặt on service badge
    expect(screen.getByTestId('booking-service-title')).toHaveTextContent('Sửa máy giặt');
    expect(screen.getByText('Tôi cần người Sửa máy giặt')).toBeOnTheScreen();

    // Confirmed UX: suggestions card is expanded by default with washing-machine chips (NOT plumbing chips)
    expect(screen.getByTestId('booking-suggestions-content')).toBeOnTheScreen();
    expect(screen.getByText('Tình trạng máy giặt')).toBeOnTheScreen();
    expect(screen.getByText('Không vắt / không quay lồng')).toBeOnTheScreen();
    expect(screen.getByText('Cửa ngang (Lồng ngang)')).toBeOnTheScreen();
    expect(screen.queryByText('Rò rỉ nước')).toBeNull();
    expect(screen.queryByText('Tầng hầm')).toBeNull();

    // Toggling the accordion collapses and re-expands the suggestions
    fireEvent.press(screen.getByTestId('booking-suggestions-toggle-btn'));
    expect(screen.queryByTestId('booking-suggestions-content')).toBeNull();
    fireEvent.press(screen.getByTestId('booking-suggestions-toggle-btn'));
    expect(screen.getByTestId('booking-suggestions-content')).toBeOnTheScreen();
  });

  it('renders plumbing suggestion chips for Sửa ống nước matching the Jira mockup', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <CustomerBookingScreen
        serviceId="b1026b8e-dd6c-478b-aeab-1afb582bcfd0"
      />,
    );

    expect(screen.getByTestId('booking-service-title')).toHaveTextContent('Sửa ống nước');
    expect(screen.getByText('Loại sự cố')).toBeOnTheScreen();
    expect(screen.getByText('Rò rỉ nước')).toBeOnTheScreen();
    expect(screen.getByText('Nhà tắm')).toBeOnTheScreen();
    expect(screen.getByText('Nặng (ngập/nguy hiểm)')).toBeOnTheScreen();
  });

  it('preserves user custom typed description when clicking and unclicking suggestion chips', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <CustomerBookingScreen
        serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"
      />,
    );

    const input = screen.getByTestId('booking-description-input');
    const customText = 'Máy bị kêu to và không vắt được';

    // 1. User types custom description
    fireEvent.changeText(input, customText);
    expect(useBookingDraftStore.getState().description).toBe(customText);

    // 2. User selects device type chip "Cửa ngang (Lồng ngang)" (expanded by default)
    const frontLoadChip = screen.getByText('Cửa ngang (Lồng ngang)');
    fireEvent.press(frontLoadChip);

    // Custom text MUST be preserved, not overwritten
    let currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Loại máy: Cửa ngang (Lồng ngang)');

    // 3. User selects severity chip "Khẩn cấp (kẹt đồ/tràn nước)"
    const severityChip = screen.getByText('Khẩn cấp (kẹt đồ/tràn nước)');
    fireEvent.press(severityChip);

    currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Loại máy: Cửa ngang (Lồng ngang)');
    expect(currentDesc).toContain('Mức độ: Khẩn cấp (kẹt đồ/tràn nước)');

    // 4. User unselects severity chip
    fireEvent.press(severityChip);
    currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Loại máy: Cửa ngang (Lồng ngang)');
    expect(currentDesc).not.toContain('Mức độ: Khẩn cấp (kẹt đồ/tràn nước)');

    // 5. User unselects device type chip -> should revert back to original custom text
    fireEvent.press(frontLoadChip);
    currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toBe(customText);
  });

  it('does not overwrite existing description when pressing next button', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <CustomerBookingScreen
        serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"
      />,
    );

    const input = screen.getByTestId('booking-description-input');
    const customText = 'Cần thay dây curoa máy giặt';
    fireEvent.changeText(input, customText);

    const nextBtn = screen.getByTestId('booking-next-btn');
    fireEvent.press(nextBtn);

    expect(useBookingDraftStore.getState().description).toBe(customText);
    expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-address');
  });

  it('booking draft store setService resolves known service ID, protects serviceName, and stores suggestion metadata', () => {
    const store = useBookingDraftStore.getState();

    // Passing just serviceId resolves known service name
    store.setService('cbb1b85c-32f9-4041-a0fd-df5cde04784f');
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa máy giặt');

    // Passing undefined name when service is already set maintains service name
    store.setService('cbb1b85c-32f9-4041-a0fd-df5cde04784f', undefined);
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa máy giặt');

    // Passing explicit service name and metadata stores them and clears on service switch
    store.setService('custom-id', 'Sửa robot hút bụi', {
      categoryId: 'cat-appliance',
      categoryName: 'Điện gia dụng',
      serviceSuggestionGroups: [
        {
          key: 'robot_issue',
          label: 'Lỗi robot',
          options: ['Lỗi cảm biến лазер', 'Không sạc được'],
        },
      ],
    });
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa robot hút bụi');
    expect(useBookingDraftStore.getState().categoryId).toBe('cat-appliance');
    expect(useBookingDraftStore.getState().serviceSuggestionGroups).toHaveLength(1);
  });

  it('prefixes serviceName when user selects suggestion chips without typing custom text first', () => {
    useAuthStore.setState({ isAuthenticated: true });

    render(
      <CustomerBookingScreen
        serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"
      />,
    );

    // Select chip "Không vắt / không quay lồng" (suggestions expanded by default)
    fireEvent.press(screen.getByText('Không vắt / không quay lồng'));

    const desc = useBookingDraftStore.getState().description;
    expect(desc).toBe('Tôi cần người Sửa máy giặt: Tình trạng: Không vắt / không quay lồng');
    expect(desc).not.toContain('Cần thợ kiểm tra');

    // Unselect chip -> clears description back to empty
    fireEvent.press(screen.getByText('Không vắt / không quay lồng'));
    expect(useBookingDraftStore.getState().description).toBe('');
  });

  it('prioritizes API serviceSuggestionGroups from store and supports multiple selection mode', () => {
    useAuthStore.setState({ isAuthenticated: true });
    useBookingDraftStore.getState().setService(
      '34ec7df5-20db-401e-804a-6feee5b48184',
      'Sửa máy lạnh',
      {
        categoryId: 'cat-hvac',
        categoryName: 'Điện lạnh',
        serviceSuggestionGroups: [
          {
            key: 'custom_symptoms',
            label: 'Triệu chứng từ Server',
            descriptionPrefix: 'Triệu chứng',
            selectionMode: 'multiple',
            options: ['Báo lỗi E1', 'Quạt dàn nóng không quay', 'Chưa rõ'],
          },
        ],
      },
    );

    render(
      <CustomerBookingScreen
        serviceId="34ec7df5-20db-401e-804a-6feee5b48184"
      />,
    );

    expect(screen.getByText('Triệu chứng từ Server')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Báo lỗi E1'));
    fireEvent.press(screen.getByText('Quạt dàn nóng không quay'));

    expect(useBookingDraftStore.getState().description).toBe(
      'Tôi cần người Sửa máy lạnh: Triệu chứng: Báo lỗi E1, Quạt dàn nóng không quay',
    );
  });

  it('resets selected chips and previous chip text when switching serviceId or pressing Điền nhanh', () => {
    useAuthStore.setState({ isAuthenticated: true });

    const { rerender } = render(
      <CustomerBookingScreen
        serviceId="b1026b8e-dd6c-478b-aeab-1afb582bcfd0"
      />,
    );

    // Select a plumbing chip
    fireEvent.press(screen.getByText('Rò rỉ nước'));
    expect(useBookingDraftStore.getState().description).toBe(
      'Tôi cần người Sửa ống nước: Sự cố: Rò rỉ nước',
    );

    // Press "Điền nhanh" -> resets selected chips and replaces description with quick text
    fireEvent.press(screen.getByText('Tôi cần người Sửa ống nước'));
    expect(useBookingDraftStore.getState().description).toBe('Tôi cần người Sửa ống nước');

    // Selecting a chip again starts fresh without duplicating old chip state
    fireEvent.press(screen.getByText('Nhà tắm'));
    expect(useBookingDraftStore.getState().description).toBe(
      'Tôi cần người Sửa ống nước: Vị trí: Nhà tắm',
    );

    // Switch service while mounted to Vệ sinh máy lạnh
    rerender(
      <CustomerBookingScreen
        serviceId="a26e3c78-f202-4ec0-a2f9-2462371d05a4"
      />,
    );

    expect(screen.getByTestId('booking-service-title')).toHaveTextContent('Vệ sinh máy lạnh');
    expect(useBookingDraftStore.getState().description).toBe('');
    expect(screen.getByText('Vệ sinh định kỳ')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Vệ sinh định kỳ'));
    expect(useBookingDraftStore.getState().description).toBe(
      'Tôi cần người Vệ sinh máy lạnh: Nhu cầu: Vệ sinh định kỳ',
    );
  });
});
