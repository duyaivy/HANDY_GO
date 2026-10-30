/* eslint-disable max-lines-per-function */
import type { HandyMapRef } from './handy-map';
import { act, render, screen } from '@testing-library/react-native';
import * as React from 'react';
import { HandyMap } from './handy-map';

describe('handyMap component', () => {
  it('renders Mapbox MapView correctly with default gesture settings', () => {
    render(<HandyMap />);

    expect(screen.getByTestId('handy-map-container')).toBeTruthy();
    const mapView = screen.getByTestId('mapbox-map-view');
    expect(mapView).toBeTruthy();
    expect(mapView.props.scrollEnabled).toBe(true);
    expect(mapView.props.zoomEnabled).toBe(true);
    expect(mapView.props.rotateEnabled).toBe(true);
    expect(mapView.props.pitchEnabled).toBe(true);
    expect(mapView.props.gestureSettings).toEqual({
      pinchPanEnabled: true,
      panEnabled: true,
      pinchZoomEnabled: true,
    });
  });

  it('configures customized gesture controls (radar mode: pan disabled, zoom enabled)', () => {
    render(
      <HandyMap
        panEnabled={false}
        pinchPanEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        zoomEnabled={true}
      />,
    );

    const mapView = screen.getByTestId('mapbox-map-view');
    expect(mapView.props.scrollEnabled).toBe(false);
    expect(mapView.props.zoomEnabled).toBe(true);
    expect(mapView.props.rotateEnabled).toBe(false);
    expect(mapView.props.pitchEnabled).toBe(false);
    expect(mapView.props.gestureSettings).toEqual({
      pinchPanEnabled: false,
      panEnabled: false,
      pinchZoomEnabled: true,
    });
  });

  it('falls back all gesture controls to interactive=false when specified', () => {
    render(<HandyMap interactive={false} />);

    const mapView = screen.getByTestId('mapbox-map-view');
    expect(mapView.props.scrollEnabled).toBe(false);
    expect(mapView.props.zoomEnabled).toBe(false);
    expect(mapView.props.rotateEnabled).toBe(false);
    expect(mapView.props.pitchEnabled).toBe(false);
    expect(mapView.props.gestureSettings).toEqual({
      pinchPanEnabled: false,
      panEnabled: false,
      pinchZoomEnabled: false,
    });
  });

  it('locks center coordinate and does not drift on region change when panEnabled is false', () => {
    const onRegionChangeSpy = jest.fn();
    render(
      <HandyMap
        panEnabled={false}
        initialCenter={{ latitude: 16.0748, longitude: 108.1499 }}
        onRegionDidChange={onRegionChangeSpy}
      />,
    );

    const mapView = screen.getByTestId('mapbox-map-view');
    act(() => {
      mapView.props.onRegionDidChange({
        geometry: {
          coordinates: [106.660172, 10.762622],
        },
      });
    });

    expect(onRegionChangeSpy).not.toHaveBeenCalled();
  });

  it('allows region change callback when panEnabled is true', () => {
    const onRegionChangeSpy = jest.fn();
    render(
      <HandyMap
        panEnabled={true}
        initialCenter={{ latitude: 16.0748, longitude: 108.1499 }}
        onRegionDidChange={onRegionChangeSpy}
      />,
    );

    const mapView = screen.getByTestId('mapbox-map-view');
    act(() => {
      mapView.props.onRegionDidChange({
        geometry: {
          coordinates: [106.660172, 10.762622],
        },
      });
    });

    expect(onRegionChangeSpy).toHaveBeenCalledWith({
      latitude: 10.762622,
      longitude: 106.660172,
    });
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
