import * as React from 'react';
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

describe('customerBookingScreen - Service Name Preservation and Non-destructive Description (TASK-06)', () => {
  it('preserves specific serviceName and resolves known service ID without falling back to generic default', () => {
    useAuthStore.setState({ isAuthenticated: true });

    // Test with Sửa máy giặt UUID
    render(
      <CustomerBookingScreen
        serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"
      />,
    );

    // Should display Sửa máy giặt on service badge
    expect(screen.getByTestId('booking-service-title')).toHaveTextContent('Sửa máy giặt');
    expect(screen.getByText('Tôi cần người Sửa máy giặt')).toBeOnTheScreen();
  });

  it('preserves user custom typed description when clicking suggestion chips', () => {
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

    // 2. User selects location chip "Nhà tắm"
    const bathroomChip = screen.getByText('Nhà tắm');
    fireEvent.press(bathroomChip);

    // Custom text MUST be preserved, not overwritten
    let currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Vị trí: Nhà tắm');

    // 3. User selects severity chip "Nặng (ngập/nguy hiểm)"
    const severityChip = screen.getByText('Nặng (ngập/nguy hiểm)');
    fireEvent.press(severityChip);

    currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Vị trí: Nhà tắm');
    expect(currentDesc).toContain('Mức độ: Nặng (ngập/nguy hiểm)');

    // 4. User unselects severity chip
    fireEvent.press(severityChip);
    currentDesc = useBookingDraftStore.getState().description;
    expect(currentDesc).toContain(customText);
    expect(currentDesc).toContain('Vị trí: Nhà tắm');
    expect(currentDesc).not.toContain('Mức độ: Nặng (ngập/nguy hiểm)');

    // 5. User unselects location chip -> should revert back to original custom text
    fireEvent.press(bathroomChip);
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

  it('booking draft store setService resolves known service ID and protects serviceName', () => {
    const store = useBookingDraftStore.getState();

    // Passing just serviceId resolves known service name
    store.setService('cbb1b85c-32f9-4041-a0fd-df5cde04784f');
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa máy giặt');

    // Passing undefined name when service is already set maintains service name
    store.setService('cbb1b85c-32f9-4041-a0fd-df5cde04784f', undefined);
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa máy giặt');

    // Passing explicit service name overrides properly
    store.setService('custom-id', 'Sửa robot hút bụi');
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa robot hút bụi');
  });
});
