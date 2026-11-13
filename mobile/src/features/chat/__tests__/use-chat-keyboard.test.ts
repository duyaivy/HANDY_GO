import type { KeyboardEvent, View } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { useChatKeyboard } from '../use-chat-keyboard';

it('adds only the actual overlap, then removes the extra inset when Android pans or resizes the window', () => {
  const listeners = new Map<string, (event: KeyboardEvent) => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
    listeners.set(event, callback);
    return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  let height = 720;
  let y = 80;
  const view = renderHook(() => useChatKeyboard());
  view.result.current.containerRef.current = {
    measureInWindow: (callback: Parameters<View['measureInWindow']>[0]) => callback(0, y, 400, height),
  } as never;
  act(() => view.result.current.onLayout());
  // Keyboard screenY includes a 40px window origin; native view measurements do not.
  act(() => listeners.get('keyboardDidShow')?.({ endCoordinates: { screenY: 540, height: 300 } } as KeyboardEvent));
  expect(view.result.current.bottomInset).toBe(300);
  expect(view.result.current.keyboardVisible).toBe(true);

  y = -220;
  act(() => view.result.current.onLayout());
  expect(view.result.current.bottomInset).toBe(0);

  y = 80;
  height = 420;
  act(() => view.result.current.onLayout());
  expect(view.result.current.bottomInset).toBe(0);

  act(() => listeners.get('keyboardDidHide')?.({} as KeyboardEvent));
  expect(view.result.current.bottomInset).toBe(0);
  expect(view.result.current.keyboardVisible).toBe(false);
  view.unmount();
  jest.restoreAllMocks();
});
