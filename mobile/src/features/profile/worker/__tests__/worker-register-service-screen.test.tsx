/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { DeviceLocationService } from '@/services/location/device-location';
import { MapboxService } from '@/services/map/mapbox-service';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerRegisterServiceScreen } from '../screens/worker-register-service-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isHydrated: true,
  });
});

describe('workerRegisterServiceScreen (Step-by-Step Flow)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-101',
        phone: '0911222333',
        email: 'worker101@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(WorkersApi, 'getCategories').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'cat-dien-lanh',
          name: 'Điện Lạnh',
          description: 'Sửa máy lạnh tủ lạnh',
          imageUrl: 'https://sample.com/dienlanh.jpg',
        },
        {
          id: 'cat-dien-nuoc',
          name: 'Điện Nước',
          description: 'Sửa đường điện đường nước',
          imageUrl: 'https://sample.com/diennuoc.jpg',
        },
      ],
    });

    jest.spyOn(WorkersApi, 'getServices').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [
        {
          id: 'svc-vesinh',
          categoryId: 'cat-dien-lanh',
          name: 'Vệ sinh máy lạnh',
          description: 'Vệ sinh lưới lọc dàn lạnh',
        },
        {
          id: 'svc-suadien',
          categoryId: 'cat-dien-lanh',
          name: 'Sửa bo mạch máy giặt',
          description: 'Sửa bo công suất',
        },
      ],
    });

    jest.spyOn(WorkersApi, 'uploadEvidenceFile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        url: 'https://res.cloudinary.com/demo/image/upload/sample_tool.jpg',
        fileType: 'image',
      },
    });

    jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
      status: 'gps_success',
      isRealGps: true,
      coordinates: {
        latitude: 16.0680,
        longitude: 108.2120,
        addressText: '123 Hải Phòng, Thạch Thang, Hải Châu, Đà Nẵng',
      },
    });

    jest.spyOn(MapboxService, 'reverseGeocode').mockResolvedValue('456 Lê Duẩn, Tân Chính, Thanh Khê, Đà Nẵng');
  });

  it('1. Step 1 only displays categories with image and search bar, then moves to Step 2 upon selection', async () => {
    render(<WorkerRegisterServiceScreen />);

    // In Step 1: Only step 1 container is visible
    await waitFor(() => {
      expect(screen.getByTestId('step-1-category-container')).toBeOnTheScreen();
      expect(screen.getByText('Điện Lạnh')).toBeOnTheScreen();
      expect(screen.getByText('Điện Nước')).toBeOnTheScreen();
    });

    // Step 2 & 3 & 4 should NOT be rendered yet
    expect(screen.queryByTestId('step-2-service-container')).toBeNull();
    expect(screen.queryByTestId('step-3-info-container')).toBeNull();
    expect(screen.queryByTestId('step-4-evidence-container')).toBeNull();

    // Test Search input in Step 1
    fireEvent.changeText(screen.getByTestId('category-search-input'), 'Điện Nước');
    expect(screen.getByText('Điện Nước')).toBeOnTheScreen();
    expect(screen.queryByText('Điện Lạnh')).toBeNull();

    // Clear search
    fireEvent.changeText(screen.getByTestId('category-search-input'), '');
    expect(screen.getByText('Điện Lạnh')).toBeOnTheScreen();

    // Selecting a category moves to Step 2
    fireEvent.press(screen.getByTestId('category-chip-cat-dien-lanh'));

    await waitFor(() => {
      expect(screen.getByTestId('step-2-service-container')).toBeOnTheScreen();
      expect(screen.queryByTestId('step-1-category-container')).toBeNull();
    });
  });

  it('2. Step 2 shows services in category, allows search and moving to Step 3 upon service selection', async () => {
    render(<WorkerRegisterServiceScreen />);

    // Select category in Step 1
    await waitFor(() => {
      expect(screen.getByTestId('category-chip-cat-dien-lanh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('category-chip-cat-dien-lanh'));

    // In Step 2: shows services
    await waitFor(() => {
      expect(screen.getByTestId('step-2-service-container')).toBeOnTheScreen();
      expect(screen.getByText('Vệ sinh máy lạnh')).toBeOnTheScreen();
      expect(screen.getByText('Sửa bo mạch máy giặt')).toBeOnTheScreen();
    });

    // Selecting a service moves to Step 3
    fireEvent.press(screen.getByTestId('service-chip-svc-vesinh'));

    await waitFor(() => {
      expect(screen.getByTestId('step-3-info-container')).toBeOnTheScreen();
      expect(screen.getByTestId('service-title-input')).toHaveProp('value', 'Vệ sinh máy lạnh');
    });
  });

  it('3. Step 3 allows editing info and moving to Step 4', async () => {
    render(<WorkerRegisterServiceScreen />);

    // Navigate to step 2
    await waitFor(() => {
      expect(screen.getByTestId('category-chip-cat-dien-lanh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('category-chip-cat-dien-lanh'));

    // Navigate to step 3
    await waitFor(() => {
      expect(screen.getByTestId('service-chip-svc-vesinh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('service-chip-svc-vesinh'));

    // In Step 3: Fill details
    await waitFor(() => {
      expect(screen.getByTestId('step-3-info-container')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByTestId('service-title-input'), 'Chuyên vệ sinh máy lạnh inverter');
    fireEvent.changeText(screen.getByTestId('service-experience-input'), '5');
    fireEvent.changeText(screen.getByTestId('service-description-input'), 'Cam kết sạch sẽ, có máy bơm cao áp');

    // Select radius 20km
    fireEvent.press(screen.getByTestId('radius-option-20'));

    // Press Next to go to Step 4
    fireEvent.press(screen.getByTestId('step-3-next-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('step-4-evidence-container')).toBeOnTheScreen();
      expect(screen.queryByTestId('step-3-info-container')).toBeNull();
    });
  });

  it('4. Step 4 uploads evidence via library/camera/link and submits full registration', async () => {
    const submitSpy = jest.spyOn(WorkersApi, 'submitServiceRegistration').mockResolvedValue({
      statusCode: 201,
      message: 'OK',
      data: {
        id: 'new-reg-999',
        workerProfileId: 'wp-101',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<WorkerRegisterServiceScreen />);

    // Move to Step 2
    await waitFor(() => {
      expect(screen.getByTestId('category-chip-cat-dien-lanh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('category-chip-cat-dien-lanh'));

    // Move to Step 3
    await waitFor(() => {
      expect(screen.getByTestId('service-chip-svc-vesinh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('service-chip-svc-vesinh'));

    // Move to Step 4
    await waitFor(() => {
      expect(screen.getByTestId('step-3-next-btn')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('step-3-next-btn'));

    // In Step 4: Add evidence link
    await waitFor(() => {
      expect(screen.getByTestId('step-4-evidence-container')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByTestId('service-evidence-input'), 'https://youtube.com/watch?v=sample-video');
    fireEvent.press(screen.getByTestId('add-evidence-url-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('evidence-item-0')).toBeOnTheScreen();
    });

    // Submit form
    fireEvent.press(screen.getByTestId('submit-service-registration-btn'));

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['cat-dien-lanh'],
          services: [
            expect.objectContaining({
              serviceId: 'svc-vesinh',
              title: 'Vệ sinh máy lạnh',
              experienceYears: 3,
            }),
          ],
          evidenceFiles: [
            expect.objectContaining({
              url: 'https://youtube.com/watch?v=sample-video',
              fileType: 'video',
            }),
          ],
        }),
      );
    });
  });

  it('5. Step 3 supports GPS location, Map picker modal, and only [5, 10, 15, 20] km radius options', async () => {
    render(<WorkerRegisterServiceScreen />);

    // Go to Step 2
    await waitFor(() => {
      expect(screen.getByTestId('category-chip-cat-dien-lanh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('category-chip-cat-dien-lanh'));

    // Go to Step 3
    await waitFor(() => {
      expect(screen.getByTestId('service-chip-svc-vesinh')).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByTestId('service-chip-svc-vesinh'));

    // In Step 3: verify GPS auto-fetch or current location button
    await waitFor(() => {
      expect(screen.getByTestId('step-3-info-container')).toBeOnTheScreen();
    });

    // Check radius options: only 5, 10, 15, 20 exist. 30 does not exist
    expect(screen.getByTestId('radius-option-5')).toBeOnTheScreen();
    expect(screen.getByTestId('radius-option-10')).toBeOnTheScreen();
    expect(screen.getByTestId('radius-option-15')).toBeOnTheScreen();
    expect(screen.getByTestId('radius-option-20')).toBeOnTheScreen();
    expect(screen.queryByTestId('radius-option-30')).toBeNull();

    // Select radius 15km
    fireEvent.press(screen.getByTestId('radius-option-15'));
    expect(screen.getByText('15 km')).toBeOnTheScreen();

    // Press Get Current Location button
    fireEvent.press(screen.getByTestId('get-current-location-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('service-address-input')).toHaveProp(
        'value',
        '123 Hải Phòng, Thạch Thang, Hải Châu, Đà Nẵng',
      );
    });

    // Open Map picker modal
    fireEvent.press(screen.getByTestId('open-map-picker-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('map-picker-modal')).toBeOnTheScreen();
      expect(screen.getByTestId('confirm-map-location-btn')).toBeOnTheScreen();
    });

    // Confirm map location and close modal
    fireEvent.press(screen.getByTestId('confirm-map-location-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('map-picker-modal')).toBeNull();
    });
  });
});
