import type { ViewStyle } from 'react-native';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui/text';
import { MapboxService } from '@/services/map/mapbox-service';

export type HandyCoordinates = {
  latitude: number;
  longitude: number;
};

export type HandyMapRef = {
  flyTo: (coords: HandyCoordinates, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type HandyMapProps = {
  initialCenter?: HandyCoordinates;
  center?: HandyCoordinates;
  zoomLevel?: number;
  interactive?: boolean;
  showCenterPin?: boolean;
  showUserLocation?: boolean;
  style?: ViewStyle;
  testID?: string;
  onRegionDidChange?: (coords: HandyCoordinates) => void;
  children?: React.ReactNode;
  mapStyle?: string;
  // Cử chỉ tùy biến nâng cao:
  panEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  pinchPanEnabled?: boolean;
  onDidFinishLoadingMap?: () => void;
};

// Default center: Hòa Khánh, Liên Chiểu, Đà Nẵng
const DEFAULT_COORDS: HandyCoordinates = {
  latitude: 16.0748,
  longitude: 108.1499,
};

export function HandyMap({ ref, ...props }: HandyMapProps & { ref?: React.RefObject<HandyMapRef | null> }) {
  const {
    initialCenter = DEFAULT_COORDS,
    center,
    zoomLevel = 15,
    interactive = true,
    showCenterPin = false,
    showUserLocation = false,
    style,
    testID = 'handy-map-container',
    onRegionDidChange,
    children,
    mapStyle,
    panEnabled,
    zoomEnabled,
    rotateEnabled,
    pitchEnabled,
    pinchPanEnabled,
    onDidFinishLoadingMap,
  } = props;

  const { theme } = useUniwind();
  const cameraRef = React.useRef<any>(null);
  const isInternalCameraUpdate = React.useRef(false);
  const hasInitialAnimatedRef = React.useRef(false);

  const targetCenter = center || initialCenter;
  const [coords, setCoords] = React.useState<HandyCoordinates>(targetCenter);

  const isPan = panEnabled ?? interactive ?? true;
  const isZoom = zoomEnabled ?? interactive ?? true;
  const isRotate = rotateEnabled ?? interactive ?? true;
  const isPitch = pitchEnabled ?? interactive ?? true;
  const isPinchPan = pinchPanEnabled ?? isPan;

  const Mapbox = React.useMemo(() => MapboxService.getMapbox(), []);

  React.useEffect(() => {
    MapboxService.init();
  }, []);

  React.useEffect(() => {
    if (center && cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
      isInternalCameraUpdate.current = true;
      cameraRef.current.setCamera({
        centerCoordinate: [center.longitude, center.latitude],
        zoomLevel,
        animationDuration: 400,
      });
      hasInitialAnimatedRef.current = true;
    }
  }, [center, zoomLevel]);

  const currentZoomRef = React.useRef(zoomLevel);

  React.useEffect(() => {
    currentZoomRef.current = zoomLevel;
  }, [zoomLevel]);

  React.useImperativeHandle(ref, () => ({
    flyTo: (targetCoords: HandyCoordinates, zoom = zoomLevel) => {
      setCoords(targetCoords);
      currentZoomRef.current = zoom;
      if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
        isInternalCameraUpdate.current = true;
        cameraRef.current.setCamera({
          centerCoordinate: [targetCoords.longitude, targetCoords.latitude],
          zoomLevel: zoom,
          animationDuration: 800,
          animationMode: 'flyTo',
        });
      }
    },
    zoomIn: () => {
      if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
        isInternalCameraUpdate.current = true;
        currentZoomRef.current = Math.min((currentZoomRef.current ?? zoomLevel) + 1, 20);
        cameraRef.current.setCamera({
          centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
          zoomLevel: currentZoomRef.current,
          animationDuration: 300,
        });
      }
    },
    zoomOut: () => {
      if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
        isInternalCameraUpdate.current = true;
        currentZoomRef.current = Math.max((currentZoomRef.current ?? zoomLevel) - 1, 3);
        cameraRef.current.setCamera({
          centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
          zoomLevel: currentZoomRef.current,
          animationDuration: 300,
        });
      }
    },
  }));

  const handleCameraChanged = React.useCallback(
    (payload: any) => {
      if (isInternalCameraUpdate.current) {
        isInternalCameraUpdate.current = false;
        return;
      }

      const newZoom = payload?.properties?.zoom ?? payload?.properties?.zoomLevel;
      // Chỉ cập nhật zoom thực tế khi đã hoàn tất animation khởi tạo và zoom không phải là zoom uninitialized ở cold start
      if (hasInitialAnimatedRef.current && typeof newZoom === 'number' && newZoom >= 6) {
        currentZoomRef.current = newZoom;
      }

      if (panEnabled === false) {
        let featureCoords = payload?.geometry?.coordinates;
        if (!featureCoords && Array.isArray(payload?.properties?.center)) {
          featureCoords = payload.properties.center;
        }

        if (Array.isArray(featureCoords) && featureCoords.length >= 2) {
          const [longitude, latitude] = featureCoords;
          const dist = Math.abs(longitude - targetCenter.longitude) + Math.abs(latitude - targetCenter.latitude);
          if (dist > 0.00002) {
            if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
              isInternalCameraUpdate.current = true;
              cameraRef.current.setCamera({
                centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
                zoomLevel: currentZoomRef.current,
                animationDuration: 0,
              });
            }
          }
        }
        return;
      }

      if (!onRegionDidChange) {
        return;
      }
      try {
        let featureCoords = payload?.geometry?.coordinates;
        if (!featureCoords && Array.isArray(payload?.properties?.center)) {
          featureCoords = payload.properties.center;
        }

        if (Array.isArray(featureCoords) && featureCoords.length >= 2) {
          const [longitude, latitude] = featureCoords;
          if (
            typeof latitude === 'number'
            && typeof longitude === 'number'
            && !Number.isNaN(latitude)
            && !Number.isNaN(longitude)
          ) {
            setCoords({ latitude, longitude });
            onRegionDidChange({ latitude, longitude });
          }
        }
      }
      catch {
        // Safe fallback
      }
    },
    [onRegionDidChange, panEnabled, targetCenter.latitude, targetCenter.longitude],
  );

  const handleDidFinishLoadingMap = React.useCallback(() => {
    if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
      isInternalCameraUpdate.current = true;
      cameraRef.current.setCamera({
        centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
        zoomLevel,
        animationDuration: 300,
      });
      hasInitialAnimatedRef.current = true;
      currentZoomRef.current = zoomLevel;
    }
    onDidFinishLoadingMap?.();
  }, [onDidFinishLoadingMap, targetCenter.latitude, targetCenter.longitude, zoomLevel]);

  const handleMapIdle = React.useCallback(
    (payload: any) => {
      if (isInternalCameraUpdate.current) {
        isInternalCameraUpdate.current = false;
        return;
      }

      if (!hasInitialAnimatedRef.current) {
        hasInitialAnimatedRef.current = true;
        currentZoomRef.current = zoomLevel;
        if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
          isInternalCameraUpdate.current = true;
          cameraRef.current.setCamera({
            centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
            zoomLevel,
            animationDuration: 300,
          });
        }
      }
      else {
        const newZoom = payload?.properties?.zoom ?? payload?.properties?.zoomLevel;
        if (typeof newZoom === 'number' && newZoom >= 6) {
          currentZoomRef.current = newZoom;
        }
      }

      if (panEnabled === false) {
        let featureCoords = payload?.geometry?.coordinates;
        if (!featureCoords && Array.isArray(payload?.properties?.center)) {
          featureCoords = payload.properties.center;
        }

        if (Array.isArray(featureCoords) && featureCoords.length >= 2) {
          const [longitude, latitude] = featureCoords;
          const dist = Math.abs(longitude - targetCenter.longitude) + Math.abs(latitude - targetCenter.latitude);
          if (dist > 0.00001) {
            if (cameraRef.current && typeof cameraRef.current.setCamera === 'function') {
              isInternalCameraUpdate.current = true;
              cameraRef.current.setCamera({
                centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
                zoomLevel: currentZoomRef.current,
                animationDuration: 150,
              });
            }
          }
        }
      }
    },
    [panEnabled, targetCenter.latitude, targetCenter.longitude, zoomLevel],
  );

  const styleURL = mapStyle || (theme === 'dark' ? MapboxService.styles.dark : MapboxService.styles.street);

  return (
    <View testID={testID} style={[styles.container, style]}>
      {Mapbox
        ? (
            <Mapbox.MapView
              testID="mapbox-map-view"
              style={styles.map}
              styleURL={styleURL}
              compassEnabled={false}
              scaleBarEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
              scrollEnabled={isPan}
              pitchEnabled={isPitch}
              rotateEnabled={isRotate}
              zoomEnabled={isZoom}
              gestureSettings={{
                pinchPanEnabled: isPinchPan,
                panEnabled: isPan,
                pinchZoomEnabled: isZoom,
              }}
              onRegionDidChange={handleCameraChanged}
              onMapIdle={handleMapIdle}
              onDidFinishLoadingMap={handleDidFinishLoadingMap}
              onCameraChanged={handleCameraChanged}
            >
              <Mapbox.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
                  zoomLevel,
                }}
                {...(panEnabled === false
                  ? {
                      centerCoordinate: [targetCenter.longitude, targetCenter.latitude],
                      zoomLevel,
                    }
                  : {})}
              />
              {showUserLocation && (
                <Mapbox.UserLocation visible showsUserHeadingIndicator />
              )}
              {children}
            </Mapbox.MapView>
          )
        : (
            <FallbackMapView
              center={center || coords}
              isDark={theme === 'dark'}
            />
          )}

      {showCenterPin && <CenterPinOverlay />}
    </View>
  );
}

function FallbackMapView({ center, isDark }: { center: HandyCoordinates; isDark: boolean }) {
  const bgColor = isDark ? '#1E293B' : '#F1F5F9';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <View testID="mapbox-fallback-view" style={[styles.map, { backgroundColor: bgColor }]}>
      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Rect width="100%" height="100%" fill={bgColor} />
        <Line x1="20%" y1="0%" x2="20%" y2="100%" stroke={gridColor} strokeWidth="1" />
        <Line x1="40%" y1="0%" x2="40%" y2="100%" stroke={gridColor} strokeWidth="1" />
        <Line x1="60%" y1="0%" x2="60%" y2="100%" stroke={gridColor} strokeWidth="1" />
        <Line x1="80%" y1="0%" x2="80%" y2="100%" stroke={gridColor} strokeWidth="1" />
        <Line x1="0%" y1="25%" x2="100%" y2="25%" stroke={gridColor} strokeWidth="1" />
        <Line x1="0%" y1="50%" x2="100%" y2="50%" stroke={gridColor} strokeWidth="1" />
        <Line x1="0%" y1="75%" x2="100%" y2="75%" stroke={gridColor} strokeWidth="1" />
        <Circle cx="50%" cy="50%" r="56" fill="rgba(245, 165, 36, 0.08)" />
        <Circle cx="50%" cy="50%" r="28" fill="rgba(245, 165, 36, 0.14)" />
      </Svg>

      <View style={styles.fallbackNotice}>
        <Text style={[styles.fallbackNoticeText, { color: textColor }]}>
          {`Định vị GPS: ${center.latitude.toFixed(4)}, ${center.longitude.toFixed(4)}`}
        </Text>
        <Text style={[styles.fallbackNoticeSubText, { color: textColor }]}>
          Chế độ xem trước • Bản đồ Mapbox Vector sẽ kích hoạt khi build native
        </Text>
      </View>
    </View>
  );
}

function CenterPinOverlay() {
  return (
    <View pointerEvents="none" style={styles.centerPinContainer} testID="map-center-pin">
      <View style={styles.pinWrapper}>
        <Svg width={38} height={48} viewBox="0 0 38 48" fill="none">
          <Path
            d="M19 0C8.5 0 0 8.5 0 19C0 32.5 19 48 19 48C19 48 38 32.5 38 19Z"
            fill="#F5A524"
          />
          <Circle cx="19" cy="19" r="7.5" fill="#FFFFFF" />
        </Svg>
        <View style={styles.pinShadow} />
      </View>
    </View>
  );
}

HandyMap.displayName = 'HandyMap';

const styles = StyleSheet.create({
  centerPinContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  fallbackNotice: {
    alignItems: 'center',
    bottom: 24,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  fallbackNoticeSubText: {
    fontSize: 10,
    marginTop: 2,
    opacity: 0.8,
    textAlign: 'center',
  },
  fallbackNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  pinShadow: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 7,
    height: 4,
    marginTop: 2,
    width: 14,
  },
  pinWrapper: {
    alignItems: 'center',
    marginBottom: 48,
  },
});
