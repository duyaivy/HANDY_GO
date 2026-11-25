import type { KeyboardEvent, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Tracks Android keyboard visibility and container overlap using window measurement,
 * adapting dynamically to window resizing/panning to prevent double-padding.
 */
export function useAndroidKeyboardInset() {
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
      const height = frame && frame.height > 0 ? frame.height : 0;
      keyboardHeight.current = height;
      const isVisible = height > 0;
      setKeyboardVisible(isVisible);
      if (isVisible) {
        // Zero-latency push to prevent any flicker/obscuring
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
      Keyboard.addListener('keyboardDidHide', hide),
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
