import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { CreatePinScreen } from '../screens/create-pin-screen';
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
  useAuthFlowStore.getState().resetFlow();
});

describe('createPinScreen (Phase 4 Step 3 - Ảnh 7)', () => {
  it('renders 6 pin indicator dots and keypad', () => {
    render(<CreatePinScreen />);
    expect(screen.getByTestId('create-pin-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-dots-container')).toBeOnTheScreen();

    // 6 dots
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`pin-dot-${i}`)).toBeOnTheScreen();
    }

    // Number keys 0-9
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByTestId(`pin-key-${i}`)).toBeOnTheScreen();
    }

    expect(screen.getByTestId('pin-key-delete')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-key-clear')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-submit-btn')).toBeOnTheScreen();
  });

  it('handles keypad entry, backspace and clear', () => {
    render(<CreatePinScreen />);

    // Press keys: 1, 2, 3
    fireEvent.press(screen.getByTestId('pin-key-1'));
    fireEvent.press(screen.getByTestId('pin-key-2'));
    fireEvent.press(screen.getByTestId('pin-key-3'));

    // Submit button should still be disabled at 3 digits
    const submitBtn = screen.getByTestId('pin-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);

    // Delete one digit
    fireEvent.press(screen.getByTestId('pin-key-delete'));

    // Clear all
    fireEvent.press(screen.getByTestId('pin-key-clear'));
    expect(useAuthFlowStore.getState().pin).toBe('');
  });

  it('completes 6-digit PIN and navigates to complete profile screen', () => {
    render(<CreatePinScreen />);

    // Enter 6 digits: 1, 2, 3, 4, 5, 6
    ['1', '2', '3', '4', '5', '6'].forEach((digit) => {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`));
    });

    expect(useAuthFlowStore.getState().pin).toBe('123456');

    // Press submit
    const submitBtn = screen.getByTestId('pin-submit-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(submitBtn);

    expect(mockPush).toHaveBeenCalledWith('/(auth)/complete-profile');
  });

  it('handles back button on app bar', () => {
    render(<CreatePinScreen />);
    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });
});
