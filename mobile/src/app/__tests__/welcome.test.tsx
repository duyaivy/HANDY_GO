import * as React from 'react';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import WelcomeScreen from '../welcome';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({ guestRole: null });
});

describe('welcomeScreen (role picker)', () => {
  it('should render customer and worker role selection cards with accessibility attributes', () => {
    render(<WelcomeScreen />);

    expect(screen.getByText('Bạn là Khách hàng hay Thợ sửa chữa?')).toBeOnTheScreen();
    expect(screen.getByText(/Vui lòng chọn vai trò phù hợp/)).toBeOnTheScreen();

    const customerCard = screen.getByTestId('welcome-customer-card');
    const workerCard = screen.getByTestId('welcome-worker-card');

    expect(customerCard).toBeOnTheScreen();
    expect(customerCard.props.accessibilityRole).toBe('radio');
    expect(customerCard.props.accessibilityLabel).toBe('Vai trò Khách hàng, chạm để chọn');

    expect(workerCard).toBeOnTheScreen();
    expect(workerCard.props.accessibilityRole).toBe('radio');
    expect(workerCard.props.accessibilityLabel).toBe('Vai trò Đối tác Thợ, chạm để chọn');

    expect(screen.getByTestId('welcome-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-login-link')).toBeOnTheScreen();
  });

  it('selects Customer by default and navigates to /customer on submit', () => {
    render(<WelcomeScreen />);

    const customerCard = screen.getByTestId('welcome-customer-card');
    const workerCard = screen.getByTestId('welcome-worker-card');

    expect(customerCard.props.accessibilityState).toEqual({ selected: true });
    expect(workerCard.props.accessibilityState).toEqual({ selected: false });

    const submitBtn = screen.getByTestId('welcome-submit-btn');
    expect(submitBtn.props.style).toEqual(
      expect.objectContaining({ backgroundColor: PRIMARY_COLOR }),
    );

    fireEvent.press(submitBtn);

    expect(useAuthStore.getState().guestRole).toBe('Customer');
    expect(mockReplace).toHaveBeenCalledWith('/customer');
  });

  it('allows picking Worker role and navigates to /worker on submit', () => {
    render(<WelcomeScreen />);

    const customerCard = screen.getByTestId('welcome-customer-card');
    const workerCard = screen.getByTestId('welcome-worker-card');

    // Switch to Worker
    fireEvent.press(workerCard);

    expect(workerCard.props.accessibilityState).toEqual({ selected: true });
    expect(customerCard.props.accessibilityState).toEqual({ selected: false });

    const submitBtn = screen.getByTestId('welcome-submit-btn');
    expect(submitBtn.props.style).toEqual(
      expect.objectContaining({ backgroundColor: SECONDARY_COLOR }),
    );

    fireEvent.press(submitBtn);

    expect(useAuthStore.getState().guestRole).toBe('Worker');
    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });

  it('navigates to login screen when clicking the login link', () => {
    render(<WelcomeScreen />);

    const loginLink = screen.getByTestId('welcome-login-link');
    expect(loginLink.props.accessibilityRole).toBe('button');
    expect(loginLink.props.accessibilityLabel).toBe('Đã có tài khoản? Đăng nhập ngay');

    fireEvent.press(loginLink);

    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });

  it('initializes with existing guestRole from auth store when available', () => {
    useAuthStore.setState({ guestRole: 'Worker' });
    render(<WelcomeScreen />);

    const workerCard = screen.getByTestId('welcome-worker-card');
    const customerCard = screen.getByTestId('welcome-customer-card');

    expect(workerCard.props.accessibilityState).toEqual({ selected: true });
    expect(customerCard.props.accessibilityState).toEqual({ selected: false });

    const submitBtn = screen.getByTestId('welcome-submit-btn');
    fireEvent.press(submitBtn);

    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });
});
