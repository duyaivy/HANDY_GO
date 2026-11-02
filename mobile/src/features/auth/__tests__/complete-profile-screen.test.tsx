import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CompleteProfileScreen } from '../screens/complete-profile-screen';
import { useAuthFlowStore } from '../use-auth-flow-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  })),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.getState().setUser(null);
  useAuthStore.getState().setGuestRole(null);
  useAuthFlowStore.getState().resetFlow();
});

describe('completeProfileScreen (Phase 4 Step 4 - Ảnh 8)', () => {
  it('renders full name input, referral code input, and submit button', () => {
    render(<CompleteProfileScreen />);
    expect(screen.getByTestId('complete-profile-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('complete-profile-fullname-input')).toBeOnTheScreen();
    expect(screen.getByTestId('complete-profile-referral-input')).toBeOnTheScreen();
    expect(screen.getByTestId('complete-profile-submit-btn')).toBeOnTheScreen();
  });

  it('validates empty full name and shows error', async () => {
    render(<CompleteProfileScreen />);
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    expect(await screen.findByText('Vui lòng nhập họ và tên')).toBeOnTheScreen();
  });

  it('validates full name minimum length', async () => {
    render(<CompleteProfileScreen />);
    fireEvent.changeText(screen.getByTestId('complete-profile-fullname-input'), 'A');
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    expect(await screen.findByText('Họ và tên phải có tối thiểu 2 ký tự')).toBeOnTheScreen();
  });

  it('submits profile and assigns Customer role when guestRole is Customer or unset', async () => {
    useAuthFlowStore.getState().setPhone('0912345678');
    useAuthStore.getState().setGuestRole('Customer');

    render(<CompleteProfileScreen />);
    fireEvent.changeText(screen.getByTestId('complete-profile-fullname-input'), 'Nguyễn Văn A');
    fireEvent.changeText(screen.getByTestId('complete-profile-referral-input'), 'REF123');
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.roles).toContain('Customer');
      expect(state.activeMode).toBe('Customer');
      expect(mockReplace).toHaveBeenCalledWith('/customer');
    });
  });

  it('submits profile and assigns Worker role when guestRole was Worker', async () => {
    useAuthFlowStore.getState().setPhone('0987654321');
    useAuthStore.getState().setGuestRole('Worker');

    render(<CompleteProfileScreen />);
    fireEvent.changeText(screen.getByTestId('complete-profile-fullname-input'), 'Trần Thợ Lành Nghề');
    fireEvent.press(screen.getByTestId('complete-profile-submit-btn'));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.roles).toContain('Worker');
      expect(state.activeMode).toBe('Worker');
      expect(mockReplace).toHaveBeenCalledWith('/worker');
    });
  });

  it('handles back button on app bar', () => {
    render(<CompleteProfileScreen />);
    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });
});
