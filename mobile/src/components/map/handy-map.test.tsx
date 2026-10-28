import type { HandyMapRef } from './handy-map';
import { act, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { HandyMap } from './handy-map';

describe('handyMap component', () => {
  it('renders Mapbox MapView correctly', () => {
    render(<HandyMap />);

    expect(screen.getByTestId('handy-map-container')).toBeTruthy();
    expect(screen.getByTestId('mapbox-map-view')).toBeTruthy();
  });

  it('renders center pin when showCenterPin is true', () => {
    render(<HandyMap showCenterPin />);

    expect(screen.getByTestId('map-center-pin')).toBeTruthy();
  });

  it('does not render center pin when showCenterPin is false', () => {
    render(<HandyMap showCenterPin={false} />);

    expect(screen.queryByTestId('map-center-pin')).toBeNull();
  });

  it('exposes flyTo method via imperative ref', () => {
    const refHolder: { current: HandyMapRef | null } = { current: null };
    function TestWrapper() {
      const ref = React.useRef<HandyMapRef>(null);
      React.useEffect(() => {
        refHolder.current = ref.current;
      }, []);
      return <HandyMap ref={ref} />;
    }
    render(<TestWrapper />);

    expect(refHolder.current).toBeDefined();
    expect(typeof refHolder.current?.flyTo).toBe('function');

    act(() => {
      refHolder.current?.flyTo({ latitude: 10.762622, longitude: 106.660172 }, 16);
    });
  });
});
