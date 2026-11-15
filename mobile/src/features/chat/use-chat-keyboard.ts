import type { KeyboardEvent, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Tracks keyboard visibility and overlap, adapting to OS window panning/resizing
 * while ensuring the input is never obscured on physical Android and iOS devices.
 */
export function useChatKeyboard() {
  const containerRef = useRef<View | null>(null);
  const initialBottom = useRef<number | null>(null);
  const keyboardHeight = useRef<number>(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const [bottomInset, setBottomInset] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const measure = useCallback(() => {
    const current = ++revision.current;
    if (keyboardHeight.current === 0) {
      setBottomInset(0);
      return;
    }
    containerRef.current?.measureInWindow((...frame) => {
      const [, y, , height] = frame;
      if (!mounted.current || current !== revision.current || keyboardHeight.current === 0) {
        return;
      }
      const currentBottom = y + height;
      if (initialBottom.current === null) {
        initialBottom.current = currentBottom;
      }
      const shrunk = Math.max(0, initialBottom.current - currentBottom);
      const overlap = Math.max(0, keyboardHeight.current - shrunk);
      setBottomInset(overlap);
    });
  }, []);

  const onLayout = useCallback(() => {
    if (!keyboardVisible) {
      containerRef.current?.measureInWindow((...frame) => {
        const [, y, , height] = frame;
        if (mounted.current && !keyboardVisible) {
          initialBottom.current = y + height;
        }
      });
    }
    else {
      measure();
    }
  }, [keyboardVisible, measure]);

  useEffect(() => {
    mounted.current = true;
    const show = (event: KeyboardEvent) => {
      const frame = event.endCoordinates;
      const height = frame.height > 0 ? frame.height : 0;
      keyboardHeight.current = height;
      const isVisible = height > 0;
      setKeyboardVisible(isVisible);
      if (isVisible) {
        // Apply keyboard height immediately so the input is never obscured while measuring
        setBottomInset(height);
        measure();
      }
      else {
        setBottomInset(0);
      }
    };
    const hide = () => {
      revision.current++;
      keyboardHeight.current = 0;
      setKeyboardVisible(false);
      setBottomInset(0);
    };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardWillChangeFrame', show),
      Keyboard.addListener('keyboardDidHide', hide),
      Keyboard.addListener('keyboardWillHide', hide),
    ];
    const rev = revision;
    return () => {
      mounted.current = false;
      rev.current++;
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [measure]);

  return { containerRef, bottomInset, keyboardVisible, onLayout };
}
