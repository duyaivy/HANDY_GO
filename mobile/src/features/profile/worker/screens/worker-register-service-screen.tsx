import type { HandyCoordinates } from '@/components/map/handy-map';
import type {
  CategoryItem,
  ServiceItem,
  SubmitServiceRegistrationPayload,
  WorkerServiceRegistrationItem,
} from '@/services/workers/workers-api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { HandyMap } from '@/components/map/handy-map';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { ArrowRight } from '@/components/ui/icons/arrow-right';
import {
  CameraIcon,
  CloseIcon,
  GpsIcon,
  MapIcon,
  MapPinIcon,
  PlusIcon,
  WrenchIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { DEFAULT_DEVICE_COORDINATES, DeviceLocationService } from '@/services/location/device-location';
import { MapboxService } from '@/services/map/mapbox-service';
import { extractDataArray, WorkersApi } from '@/services/workers/workers-api';

type UploadedEvidenceItem = {
  id: string;
  url: string;
  fileType: 'image' | 'video';
  name?: string;
};

type Step = 1 | 2 | 3 | 4;

const RADIUS_OPTIONS = [5, 10, 15, 20] as const;

const FALLBACK_CATEGORIES: CategoryItem[] = [
  {
    id: 'cat-dien-lanh',
    name: 'Điện Lạnh',
    description: 'Sửa chữa và bảo dưỡng máy lạnh, tủ lạnh, máy giặt, điều hòa trung tâm',
    imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80',
  },
  {
    id: 'cat-dien-nuoc',
    name: 'Điện Nước',
    description: 'Xử lý chập điện, lắp thiết bị chiếu sáng, rò rỉ đường ống nước, máy bơm',
    imageUrl: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400&q=80',
  },
  {
    id: 'cat-co-khi',
    name: 'Cơ Khí & Nhôm Kính',
    description: 'Hàn sửa cửa sắt, lan can, hàng rào, vách nhôm kính, thay khóa cửa',
    imageUrl: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&q=80',
  },
  {
    id: 'cat-xay-dung',
    name: 'Xây Dựng & Sơn Sửa',
    description: 'Sơn nhà, bả matit, dặm vá tường cũ, chống thấm trần sàn, ốp lát gạch',
    imageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400&q=80',
  },
  {
    id: 'cat-do-go',
    name: 'Đồ Gỗ & Nội Thất',
    description: 'Sửa chữa đồ gỗ, thay bản lề, đóng mới kệ tủ bàn ghế gia đình & văn phòng',
    imageUrl: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=400&q=80',
  },
  {
    id: 'cat-thiet-bi-nha-bep',
    name: 'Thiết Bị Nhà Bếp',
    description: 'Sửa chữa bếp từ, bếp hồng ngoại, máy hút mùi, lò vi sóng, máy rửa bát',
    imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=400&q=80',
  },
];

const FALLBACK_SERVICES_MAP: Record<string, ServiceItem[]> = {
  'cat-dien-lanh': [
    { id: 'svc-vesinh-maylanh', categoryId: 'cat-dien-lanh', name: 'Vệ sinh & bảo dưỡng máy lạnh', description: 'Vệ sinh lưới lọc, xịt rửa dàn nóng dàn lạnh, kiểm tra gas' },
    { id: 'svc-sua-maylanh', categoryId: 'cat-dien-lanh', name: 'Sửa chữa máy lạnh không lạnh / rò ga', description: 'Khắc phục xì ga, thay tụ đề, sửa quạt dàn lạnh' },
    { id: 'svc-sua-maygiat', categoryId: 'cat-dien-lanh', name: 'Sửa máy giặt không vắt / lỗi bo mạch', description: 'Xử lý lỗi cấp nước, van xả, rung lắc mạnh khi vắt' },
    { id: 'svc-sua-tulanh', categoryId: 'cat-dien-lanh', name: 'Sửa tủ lạnh không đông đá / kêu to', description: 'Xử lý đóng tuyết, thay rơ-le nhiệt, nạp gas tủ lạnh' },
  ],
  'cat-dien-nuoc': [
    { id: 'svc-sua-duongdien', categoryId: 'cat-dien-nuoc', name: 'Sửa chập điện & nhảy CB', description: 'Dò tìm điểm chập cháy âm tường, thay thế aptomat an toàn' },
    { id: 'svc-lap-thietbi-dien', categoryId: 'cat-dien-nuoc', name: 'Lắp đặt đèn quạt & thiết bị điện', description: 'Lắp quạt trần, đèn led trang trí, ổ cắm công tắc' },
    { id: 'svc-sua-ongnuoc', categoryId: 'cat-dien-nuoc', name: 'Sửa rò rỉ đường ống nước & van khóa', description: 'Thay thế van nước gãy, hàn nối ống nhiệt PPR' },
    { id: 'svc-thong-tac', categoryId: 'cat-dien-nuoc', name: 'Thông tắc bồn cầu & cống nghẹt', description: 'Thông tắc bằng máy lò xo chuyên dụng không đục phá' },
  ],
  'cat-co-khi': [
    { id: 'svc-han-sat', categoryId: 'cat-co-khi', name: 'Hàn sửa cửa sắt & hàng rào', description: 'Hàn gia cố bản lề rỉ sét, sửa ray cửa kéo cửa cuốn' },
    { id: 'svc-lap-cuanhom', categoryId: 'cat-co-khi', name: 'Lắp đặt & sửa chữa cửa nhôm kính', description: 'Thay kính vỡ, thay bánh xe cửa lùa, gioăng cách âm' },
    { id: 'svc-sua-maiton', categoryId: 'cat-co-khi', name: 'Sửa mái tôn chống dột', description: 'Bắn vít silicone chống dột, thay máng xối nước mưa' },
  ],
  'cat-xay-dung': [
    { id: 'svc-son-nha', categoryId: 'cat-xay-dung', name: 'Sơn nhà & dặm vá tường cũ', description: 'Xử lý tường ẩm mốc, sơn lót kháng kiềm, sơn phủ hoàn thiện' },
    { id: 'svc-chong-tham', categoryId: 'cat-xay-dung', name: 'Xử lý chống thấm tường & sàn ban công', description: 'Quét màng chống thấm polyurethane, xử lý vết nứt kết cấu' },
    { id: 'svc-op-lat', categoryId: 'cat-xay-dung', name: 'Ốp lát gạch nền & gạch tường', description: 'Cắt lát gạch granite, gạch men, dặm vá gạch phồng rộp' },
  ],
  'cat-do-go': [
    { id: 'svc-sua-do-go', categoryId: 'cat-do-go', name: 'Sửa chữa đồ gỗ & bàn ghế', description: 'Gia cố bàn ghế lung lay, thay ray trượt ngăn kéo tủ' },
    { id: 'svc-sua-khoa-cua', categoryId: 'cat-do-go', name: 'Sửa & thay khóa cửa gỗ / tay gạt', description: 'Lắp đặt ổ khóa mới, sửa khóa kẹt không mở được chìa' },
  ],
  'cat-thiet-bi-nha-bep': [
    { id: 'svc-sua-bep-tu', categoryId: 'cat-thiet-bi-nha-bep', name: 'Sửa bếp từ & bếp hồng ngoại', description: 'Sửa lỗi không nhận nồi, lỗi bo công suất, nổ cầu chì' },
    { id: 'svc-sua-may-hut-mui', categoryId: 'cat-thiet-bi-nha-bep', name: 'Sửa máy hút mùi nhà bếp', description: 'Vệ sinh dầu mỡ động cơ, thay than hoạt tính khử mùi' },
  ],
};

export function WorkerRegisterServiceScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    editRegistrationId?: string;
    registrationData?: string;
  }>();

  const isEditing = Boolean(params.editRegistrationId);

  // Wizard Step State (1 -> 2 -> 3 -> 4)
  const [currentStep, setCurrentStep] = React.useState<Step>(1);

  // Search queries
  const [categorySearchQuery, setCategorySearchQuery] = React.useState('');
  const [serviceSearchQuery, setServiceSearchQuery] = React.useState('');

  // Selected Category & Service
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = React.useState<string>('');

  // Service Details (Step 3)
  const [serviceTitle, setServiceTitle] = React.useState('');
  const [experienceYears, setExperienceYears] = React.useState('3');
  const [description, setDescription] = React.useState('');

  // Service Area & GPS Coordinates (Step 3)
  const [workAddress, setWorkAddress] = React.useState(DEFAULT_DEVICE_COORDINATES.addressText);
  const [workCoords, setWorkCoords] = React.useState<{ latitude: number; longitude: number }>({
    latitude: DEFAULT_DEVICE_COORDINATES.latitude,
    longitude: DEFAULT_DEVICE_COORDINATES.longitude,
  });
  const [radiusKm, setRadiusKm] = React.useState<number>(10);
  const [isLocating, setIsLocating] = React.useState(false);

  // Map Picker Modal State
  const [isMapModalVisible, setIsMapModalVisible] = React.useState(false);
  const [mapCoords, setMapCoords] = React.useState<HandyCoordinates>({
    latitude: DEFAULT_DEVICE_COORDINATES.latitude,
    longitude: DEFAULT_DEVICE_COORDINATES.longitude,
  });
  const [mapAddress, setMapAddress] = React.useState(DEFAULT_DEVICE_COORDINATES.addressText);
  const [isReverseGeocoding, setIsReverseGeocoding] = React.useState(false);
  const mapDebounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoFetchedLocationRef = React.useRef(false);

  // Lấy vị trí GPS hiện tại từ thiết bị
  const fetchDeviceLocation = React.useCallback(async (showFeedback = true) => {
    try {
      setIsLocating(true);
      const result = await DeviceLocationService.getDeviceLocationResult();
      if (result.status === 'gps_success' && result.coordinates) {
        const nextCoords = {
          latitude: result.coordinates.latitude,
          longitude: result.coordinates.longitude,
        };
        const nextAddress = result.coordinates.addressText || DEFAULT_DEVICE_COORDINATES.addressText;
        setWorkCoords(nextCoords);
        setWorkAddress(nextAddress);
        setMapCoords(nextCoords);
        setMapAddress(nextAddress);

        if (showFeedback) {
          Alert.alert('Vị trí hiện tại', `Đã xác định vị trí của bạn:\n${nextAddress}`);
        }
      }
      else if (showFeedback) {
        if (result.status === 'permission_denied') {
          Alert.alert(
            'Quyền truy cập bị từ chối',
            'Vui lòng cấp quyền truy cập vị trí trong Cài đặt hoặc bấm "Chọn trên bản đồ".',
          );
        }
        else {
          Alert.alert(
            'Không thể lấy vị trí',
            'Không thể xác định vị trí GPS. Bạn có thể bấm "Chọn trên bản đồ" để ghim vị trí chính xác.',
          );
        }
      }
    }
    catch (err) {
      console.warn('[WORKER REGISTER] Lấy vị trí GPS thất bại:', err);
      if (showFeedback) {
        Alert.alert('Lỗi', 'Không thể lấy vị trí GPS. Vui lòng chọn vị trí trên bản đồ.');
      }
    }
    finally {
      setIsLocating(false);
    }
  }, []);

  // Tự động định vị khi lần đầu chuyển sang Bước 3
  React.useEffect(() => {
    if (currentStep === 3 && !hasAutoFetchedLocationRef.current) {
      hasAutoFetchedLocationRef.current = true;
      fetchDeviceLocation(false);
    }
  }, [currentStep, fetchDeviceLocation]);

  // Mở modal chọn vị trí bản đồ
  const handleOpenMapModal = () => {
    setMapCoords(workCoords);
    setMapAddress(workAddress);
    setIsMapModalVisible(true);
  };

  // Kéo rê bản đồ -> Reverse geocode
  const handleMapRegionChange = React.useCallback((coords: HandyCoordinates) => {
    setMapCoords(coords);
    setIsReverseGeocoding(true);
    if (mapDebounceTimerRef.current) {
      clearTimeout(mapDebounceTimerRef.current);
    }
    mapDebounceTimerRef.current = setTimeout(async () => {
      try {
        const addr = await MapboxService.reverseGeocode(coords.latitude, coords.longitude);
        if (addr) {
          setMapAddress(addr);
        }
      }
      catch (err) {
        console.warn('[WORKER REGISTER] Reverse geocode error:', err);
      }
      finally {
        setIsReverseGeocoding(false);
      }
    }, 450);
  }, []);

  // Xác nhận vị trí từ modal bản đồ
  const handleConfirmMapLocation = () => {
    setWorkCoords(mapCoords);
    setWorkAddress(mapAddress);
    setIsMapModalVisible(false);
  };

  // Evidence Files & URLs (Step 4)
  const [evidenceList, setEvidenceList] = React.useState<UploadedEvidenceItem[]>([]);
  const [manualEvidenceUrl, setManualEvidenceUrl] = React.useState('');
  const [isUploadingFile, setIsUploadingFile] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Pre-fill form when editing an existing registration
  React.useEffect(() => {
    if (params.registrationData) {
      try {
        const data = JSON.parse(params.registrationData) as WorkerServiceRegistrationItem;
        if (data.categoryIds?.[0]) {
          setSelectedCategoryId(data.categoryIds[0]);
        }
        const svc = data.services?.[0];
        if (svc) {
          if (svc.serviceId) {
            setSelectedServiceId(svc.serviceId);
          }
          if (svc.title) {
            setServiceTitle(svc.title);
          }
          if (svc.experienceYears !== undefined) {
            setExperienceYears(String(svc.experienceYears));
          }
          if (svc.description) {
            setDescription(svc.description);
          }
        }
        if (data.serviceArea?.address) {
          setWorkAddress(data.serviceArea.address);
        }
        if (data.serviceArea?.latitude && data.serviceArea?.longitude) {
          const nextCoords = {
            latitude: data.serviceArea.latitude,
            longitude: data.serviceArea.longitude,
          };
          setWorkCoords(nextCoords);
          setMapCoords(nextCoords);
        }
        if (data.serviceArea?.radiusKm) {
          setRadiusKm(data.serviceArea.radiusKm);
        }
        if (data.evidenceFiles && data.evidenceFiles.length > 0) {
          setEvidenceList(
            data.evidenceFiles.map((ev, idx) => ({
              id: `ev-${idx}-${Date.now()}`,
              url: ev.url,
              fileType: ev.fileType,
              name: ev.name,
            })),
          );
        }
        // Khi chỉnh sửa, đưa người thợ thẳng đến Bước 3 để tiện xem lại và chỉnh sửa
        setCurrentStep(3);
      }
      catch (e) {
        console.warn('[WORKER REGISTER] Lỗi parse registrationData:', e);
      }
    }
  }, [params.registrationData]);

  // Back handling across steps
  const handleBack = React.useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => (prev - 1) as Step);
      return;
    }
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
    }
    else if (typeof router.back === 'function') {
      router.back();
    }
    else {
      router.replace(RouteNames.WORKER_SKILLS as any);
    }
  }, [currentStep, router]);

  React.useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleBack]);

  // Query: Catalog Categories
  const categoriesQuery = useQuery<CategoryItem[]>({
    queryKey: ['catalog-categories'],
    queryFn: async () => {
      try {
        const res = await WorkersApi.getCategories();
        return extractDataArray<CategoryItem>(res.data ?? res);
      }
      catch (err) {
        console.warn('[WORKER REGISTER] Lấy danh mục thất bại:', err);
        return [];
      }
    },
    staleTime: 60 * 1000,
  });

  const apiCategories = React.useMemo(() => {
    return extractDataArray<CategoryItem>(categoriesQuery.data);
  }, [categoriesQuery.data]);

  const categories: CategoryItem[] = React.useMemo(() => {
    if (apiCategories.length > 0) {
      return apiCategories;
    }
    return FALLBACK_CATEGORIES;
  }, [apiCategories]);

  // Filter categories by search
  const filteredCategories = React.useMemo(() => {
    const q = categorySearchQuery.trim().toLowerCase();
    if (!q) {
      return categories;
    }
    return categories.filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [categories, categorySearchQuery]);

  const effectiveCategoryId = selectedCategoryId || (categories[0]?.id ?? '');
  const selectedCategoryObj = React.useMemo(
    () => categories.find(c => c.id === effectiveCategoryId),
    [categories, effectiveCategoryId],
  );

  // Query: Catalog Services for Selected Category
  const servicesQuery = useQuery<ServiceItem[]>({
    queryKey: ['catalog-services', effectiveCategoryId],
    queryFn: async () => {
      try {
        const res = await WorkersApi.getServices(effectiveCategoryId || undefined);
        return extractDataArray<ServiceItem>(res.data ?? res);
      }
      catch (err) {
        console.warn('[WORKER REGISTER] Lấy dịch vụ thất bại:', err);
        return [];
      }
    },
    enabled: Boolean(effectiveCategoryId),
    staleTime: 60 * 1000,
  });

  const apiServices = React.useMemo(() => {
    return extractDataArray<ServiceItem>(servicesQuery.data);
  }, [servicesQuery.data]);

  const services: ServiceItem[] = React.useMemo(() => {
    if (apiServices.length > 0) {
      return apiServices;
    }
    const fallbackList = FALLBACK_SERVICES_MAP[effectiveCategoryId];
    if (fallbackList && fallbackList.length > 0) {
      return fallbackList;
    }
    const currentCatName = selectedCategoryObj?.name || 'chuyên môn';
    return [
      {
        id: `svc-${effectiveCategoryId || 'general'}-1`,
        categoryId: effectiveCategoryId || 'cat-general',
        name: `Nghiệp vụ dịch vụ ${currentCatName}`,
        description: `Dịch vụ chuyên môn trong ngành ${currentCatName}`,
      },
    ];
  }, [apiServices, effectiveCategoryId, selectedCategoryObj]);

  // Filter services by search
  const filteredServices = React.useMemo(() => {
    const q = serviceSearchQuery.trim().toLowerCase();
    if (!q) {
      return services;
    }
    return services.filter(s =>
      s.name.toLowerCase().includes(q)
      || (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [services, serviceSearchQuery]);

  const effectiveServiceId = selectedServiceId || (services[0]?.id ?? '');
  const selectedServiceObj = React.useMemo(
    () => services.find(s => s.id === effectiveServiceId),
    [services, effectiveServiceId],
  );

  // Handle uploading asset to server
  const uploadAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const uri = asset.uri;
    const isVideo = asset.type === 'video' || uri.endsWith('.mp4') || uri.endsWith('.mov');
    const fileType: 'image' | 'video' = isVideo ? 'video' : 'image';
    const filename = uri.split('/').pop() || (isVideo ? 'evidence.mp4' : 'evidence.jpg');

    const formData = new FormData();
    const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
    formData.append('file', {
      uri,
      name: filename,
      type: mimeType,
    } as any);

    try {
      setIsUploadingFile(true);
      const res = await WorkersApi.uploadEvidenceFile(formData);
      const uploadedUrl = res.data?.url || uri;
      setEvidenceList(prev => [
        ...prev,
        {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: uploadedUrl,
          fileType: res.data?.fileType || fileType,
          name: filename,
        },
      ]);
    }
    catch (err: any) {
      console.warn('[REGISTER SERVICE] Upload file thất bại, lưu tệp cục bộ:', err);
      setEvidenceList(prev => [
        ...prev,
        {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: uri,
          fileType,
          name: filename,
        },
      ]);
      Alert.alert('Đã đính kèm tệp', 'Tệp đã được chọn và chuẩn bị gửi lên hệ thống cùng hồ sơ.');
    }
    finally {
      setIsUploadingFile(false);
    }
  };

  // Pick from Library (photos / videos)
  const handlePickFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Cần quyền Thư viện ảnh/video',
          'Vui lòng cấp quyền truy cập Thư viện trong Cài đặt của điện thoại để tải lên ảnh hoặc video đồ nghề.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        for (const asset of result.assets) {
          await uploadAsset(asset);
        }
      }
    }
    catch (err) {
      console.warn('[REGISTER SERVICE] Mở thư viện thất bại:', err);
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh/video. Vui lòng thử lại.');
    }
  };

  // Capture from Camera (photo / video)
  const handlePickFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Cần quyền Máy ảnh',
          'Vui lòng cấp quyền sử dụng Máy ảnh trong Cài đặt để chụp ảnh đồ nghề hoặc quay video thực hiện.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAsset(result.assets[0]);
      }
    }
    catch (err) {
      console.warn('[REGISTER SERVICE] Mở máy ảnh thất bại:', err);
      Alert.alert('Lỗi', 'Không thể mở máy ảnh. Vui lòng thử lại.');
    }
  };

  const handleAddManualUrl = () => {
    const trimmed = manualEvidenceUrl.trim();
    if (!trimmed) {
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('Liên kết không hợp lệ', 'Vui lòng nhập đường dẫn bắt đầu bằng http:// hoặc https://');
      return;
    }
    const isVideo = trimmed.includes('youtube') || trimmed.includes('.mp4');
    setEvidenceList(prev => [
      ...prev,
      {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: trimmed,
        fileType: isVideo ? 'video' : 'image',
        name: 'Đường dẫn liên kết',
      },
    ]);
    setManualEvidenceUrl('');
  };

  const handleRemoveEvidence = (index: number) => {
    setEvidenceList(prev => prev.filter((_, idx) => idx !== index));
  };

  // Submit Registration Form (Step 4)
  const handleSubmitRegistration = async () => {
    const targetCategoryId = selectedCategoryId || effectiveCategoryId;
    const targetServiceId = selectedServiceId || effectiveServiceId;

    if (!targetCategoryId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn danh mục nghề nghiệp.');
      return;
    }
    if (!targetServiceId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn nghiệp vụ dịch vụ muốn đăng ký.');
      return;
    }
    if (!serviceTitle.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề hiển thị của nghiệp vụ.');
      return;
    }

    const exp = Number.parseInt(experienceYears, 10);
    if (Number.isNaN(exp) || exp < 0) {
      Alert.alert('Lỗi', 'Số năm kinh nghiệm phải là một số không âm.');
      return;
    }

    if (evidenceList.length === 0) {
      Alert.alert(
        'Cần minh chứng năng lực',
        'Vui lòng tải lên ít nhất 1 hình ảnh hoặc video minh chứng tay nghề/đồ nghề để Admin kiểm duyệt.',
      );
      return;
    }

    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const payload: SubmitServiceRegistrationPayload = {
      categoryIds: [targetCategoryId],
      services: [
        {
          serviceId: targetServiceId,
          title: serviceTitle.trim(),
          description: description.trim() || undefined,
          experienceYears: exp,
        },
      ],
      serviceArea: {
        address: workAddress.trim() || DEFAULT_DEVICE_COORDINATES.addressText,
        latitude: workCoords.latitude,
        longitude: workCoords.longitude,
        radiusKm,
      },
      evidenceFiles: evidenceList.map((item, idx) => ({
        url: item.url,
        fileType: item.fileType,
        name: item.name || `Minh chứng ${idx + 1}`,
      })),
      idempotencyKey,
    };

    try {
      setIsSubmitting(true);
      if (params.editRegistrationId) {
        await WorkersApi.updateServiceRegistration(params.editRegistrationId, payload);
      }
      else {
        await WorkersApi.submitServiceRegistration(payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['worker-my-service-registrations'] });

      Alert.alert(
        params.editRegistrationId ? 'Cập nhật thành công' : 'Gửi hồ sơ thành công',
        params.editRegistrationId
          ? 'Hồ sơ dịch vụ đã được cập nhật thành công và đang chờ Admin duyệt lại!'
          : 'Nghiệp vụ dịch vụ đã được gửi lên hệ thống. Quản trị viên sẽ tiến hành kiểm duyệt hồ sơ trong thời gian sớm nhất!',
        [
          {
            text: 'Xem trạng thái duyệt',
            onPress: () => router.replace(RouteNames.WORKER_SKILLS as any),
          },
        ],
      );
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi gửi hồ sơ đăng ký.';
      Alert.alert('Không thể gửi hồ sơ', Array.isArray(msg) ? msg.join('\n') : msg);
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="worker-register-service-screen" className="flex-1 pb-16">
        {/* Header Bar */}
        <View className="relative h-14 flex-row items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            testID="app-bar-back-btn"
            onPress={handleBack}
            className="size-10 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>

          <View className="items-center">
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              {isEditing ? 'Chỉnh sửa nghiệp vụ dịch vụ' : 'Đăng ký nghiệp vụ mới'}
            </Text>
            <Text className="text-[11px] font-medium text-neutral-400">
              {currentStep === 1 && 'Bước 1/4: Chọn danh mục nghề nghiệp'}
              {currentStep === 2 && 'Bước 2/4: Chọn dịch vụ chuyên môn'}
              {currentStep === 3 && 'Bước 3/4: Khai báo thông tin & khu vực'}
              {currentStep === 4 && 'Bước 4/4: Tải minh chứng tay nghề'}
            </Text>
          </View>

          <View className="size-10 items-center justify-center">
            <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">
              {currentStep}
              /4
            </Text>
          </View>
        </View>

        {/* Step Progress Bar */}
        <View className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-800">
          <View
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </View>

        {/* Step Navigation Pills */}
        <View className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
          {[
            { step: 1, label: '1. Danh mục' },
            { step: 2, label: '2. Dịch vụ' },
            { step: 3, label: '3. Thông tin' },
            { step: 4, label: '4. Bằng chứng' },
          ].map(s => (
            <Pressable
              key={s.step}
              onPress={() => {
                // Cho phép quay lại các bước trước đó
                if (s.step < currentStep) {
                  setCurrentStep(s.step as Step);
                }
              }}
              disabled={s.step > currentStep}
              className={`rounded-lg px-2.5 py-1 ${currentStep === s.step
                ? 'bg-blue-600'
                : s.step < currentStep
                  ? 'bg-blue-50 dark:bg-blue-950/60'
                  : 'opacity-40'
              }`}
            >
              <Text
                className={`text-[11px] font-bold ${currentStep === s.step
                  ? 'text-white'
                  : s.step < currentStep
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-neutral-500'
                }`}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ============================================================ */}
        {/* BƯỚC 1: CHỌN DANH MỤC NGHỀ NGHIỆP                           */}
        {/* ============================================================ */}
        {currentStep === 1 && (
          <View testID="step-1-category-container" className="p-4">
            <View className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
              <View className="flex-row items-center gap-2">
                <View className="size-7 items-center justify-center rounded-lg bg-blue-600">
                  <WrenchIcon size={14} color="#FFFFFF" />
                </View>
                <Text className="text-sm font-bold text-blue-900 dark:text-blue-200">
                  Bước 1: Chọn danh mục nghề nghiệp của bạn
                </Text>
              </View>
              <Text className="mt-1 text-xs/relaxed text-blue-800 dark:text-blue-300">
                Hãy chọn lĩnh vực ngành nghề bạn đang hành nghề hoặc có chuyên môn tay nghề cao nhất.
              </Text>
            </View>

            {/* Thanh tìm kiếm danh mục */}
            <View className="mt-4 flex-row items-center rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              <TextInput
                testID="category-search-input"
                placeholder="Tìm danh mục nghề nghiệp (Điện lạnh, Điện nước...)"
                value={categorySearchQuery}
                onChangeText={setCategorySearchQuery}
                className="flex-1 text-xs text-neutral-900 dark:text-white"
              />
              {categorySearchQuery.length > 0 && (
                <Pressable onPress={() => setCategorySearchQuery('')} className="p-1">
                  <CloseIcon size={14} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {/* Loading indicator */}
            {categoriesQuery.isLoading && (
              <View className="mt-8 items-center justify-center py-6">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="mt-2 text-xs text-neutral-400">Đang tải danh mục hệ thống...</Text>
              </View>
            )}

            {/* Danh sách Danh mục (Tên + Hình ảnh + Mô tả) */}
            <View className="mt-4 space-y-3">
              {filteredCategories.map((cat) => {
                const isSelected = effectiveCategoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    testID={`category-chip-${cat.id}`}
                    onPress={() => {
                      setSelectedCategoryId(cat.id);
                      setSelectedServiceId('');
                      // Chuyển ngay sang bước 2
                      setCurrentStep(2);
                    }}
                    className={`flex-row items-center rounded-2xl border p-3.5 shadow-2xs active:bg-blue-50/50 ${isSelected
                      ? 'border-blue-600 bg-blue-50/90 dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    {/* Hình ảnh danh mục */}
                    {cat.imageUrl
                      ? (
                          <Image
                            source={{ uri: cat.imageUrl }}
                            className="size-16 rounded-xl border border-neutral-200 dark:border-neutral-700"
                            contentFit="cover"
                          />
                        )
                      : (
                          <View className="size-16 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950">
                            <WrenchIcon size={24} color="#2563EB" />
                          </View>
                        )}

                    {/* Thông tin danh mục */}
                    <View className="ml-3.5 flex-1 pr-2">
                      <View className="flex-row items-center justify-between">
                        <Text
                          className={`text-sm font-bold ${isSelected
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-neutral-900 dark:text-white'
                          }`}
                        >
                          {cat.name}
                        </Text>
                      </View>
                      <Text
                        className="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
                        numberOfLines={2}
                      >
                        {cat.description || 'Nghiệp vụ dịch vụ chuyên môn'}
                      </Text>
                    </View>

                    {/* Nút mũi tên chuyển bước */}
                    <View className="size-8 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-900/40">
                      <ArrowRight color="#2563EB" width={8} height={16} />
                    </View>
                  </Pressable>
                );
              })}

              {filteredCategories.length === 0 && (
                <View className="items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
                  <Text className="text-xs text-neutral-500">
                    {`Không tìm thấy danh mục phù hợp với "${categorySearchQuery}".`}
                  </Text>
                  <Button
                    label="Xóa tìm kiếm"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onPress={() => setCategorySearchQuery('')}
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {/* BƯỚC 2: CHỌN DỊCH VỤ TRONG DANH MỤC                          */}
        {/* ============================================================ */}
        {currentStep === 2 && (
          <View testID="step-2-service-container" className="p-4">
            {/* Banner hiển thị danh mục đã chọn & nút đổi danh mục */}
            <View className="flex-row items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/90 p-3.5 dark:border-blue-900 dark:bg-blue-950/40">
              <View className="flex-1 flex-row items-center">
                {selectedCategoryObj?.imageUrl
                  ? (
                      <Image
                        source={{ uri: selectedCategoryObj.imageUrl }}
                        className="size-10 rounded-lg"
                        contentFit="cover"
                      />
                    )
                  : (
                      <View className="size-10 items-center justify-center rounded-lg bg-blue-600">
                        <WrenchIcon size={16} color="#FFFFFF" />
                      </View>
                    )}
                <View className="ml-3 flex-1">
                  <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Danh mục đã chọn:
                  </Text>
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                    {selectedCategoryObj?.name || 'Ngành nghề'}
                  </Text>
                </View>
              </View>

              <Pressable
                testID="change-category-btn"
                onPress={() => setCurrentStep(1)}
                className="rounded-lg bg-white px-3 py-1.5 shadow-2xs dark:bg-neutral-800"
              >
                <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">Đổi danh mục</Text>
              </Pressable>
            </View>

            {/* Thanh tìm kiếm dịch vụ */}
            <View className="mt-4 flex-row items-center rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              <TextInput
                testID="service-search-input"
                placeholder="Tìm dịch vụ (Sửa máy lạnh, Thông tắc...)"
                value={serviceSearchQuery}
                onChangeText={setServiceSearchQuery}
                className="flex-1 text-xs text-neutral-900 dark:text-white"
              />
              {serviceSearchQuery.length > 0 && (
                <Pressable onPress={() => setServiceSearchQuery('')} className="p-1">
                  <CloseIcon size={14} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {/* Loading Services */}
            {servicesQuery.isLoading && (
              <View className="mt-8 items-center justify-center py-6">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="mt-2 text-xs text-neutral-400">Đang tải danh sách dịch vụ...</Text>
              </View>
            )}

            {/* Danh sách Dịch vụ */}
            <View className="mt-4 space-y-3">
              {filteredServices.map((svc) => {
                const isSelected = effectiveServiceId === svc.id;
                return (
                  <Pressable
                    key={svc.id}
                    testID={`service-chip-${svc.id}`}
                    onPress={() => {
                      setSelectedServiceId(svc.id);
                      setServiceTitle(svc.name);
                      // Chuyển sang bước 3 nhập thông tin khác
                      setCurrentStep(3);
                    }}
                    className={`flex-row items-center justify-between rounded-2xl border p-4 shadow-2xs active:bg-blue-50/50 ${isSelected
                      ? 'border-blue-600 bg-blue-50/90 dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    <View className="flex-1 pr-3">
                      <Text
                        className={`text-sm font-bold ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {svc.name}
                      </Text>
                      {svc.description && (
                        <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={2}>
                          {svc.description}
                        </Text>
                      )}
                    </View>

                    <View className="size-8 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-900/40">
                      <ArrowRight color="#2563EB" width={8} height={16} />
                    </View>
                  </Pressable>
                );
              })}

              {filteredServices.length === 0 && (
                <View className="items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
                  <Text className="text-xs text-neutral-500">
                    {`Không tìm thấy dịch vụ nào phù hợp với "${serviceSearchQuery}".`}
                  </Text>
                </View>
              )}
            </View>

            {/* Nút quay lại bước 1 */}
            <Button
              testID="step-2-back-btn"
              label="Quay lại chọn danh mục khác"
              variant="outline"
              size="sm"
              className="mt-6 w-full"
              onPress={() => setCurrentStep(1)}
            />
          </View>
        )}

        {/* ============================================================ */}
        {/* BƯỚC 3: NHẬP CÁC THÔNG TIN KHÁC (KINH NGHIỆM, MÔ TẢ, BÁN KÍNH) */}
        {/* ============================================================ */}
        {currentStep === 3 && (
          <View testID="step-3-info-container" className="p-4">
            {/* Tóm tắt Danh mục & Dịch vụ đã chọn */}
            <View className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="flex-row items-center justify-between border-b border-neutral-100 pb-2.5 dark:border-neutral-800">
                <Text className="text-xs font-medium text-neutral-500">Nghiệp vụ đã chọn:</Text>
                <Pressable testID="change-service-btn" onPress={() => setCurrentStep(2)}>
                  <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">Thay đổi</Text>
                </Pressable>
              </View>
              <View className="mt-2.5 flex-row items-center gap-2">
                <View className="size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
                  <WrenchIcon size={14} color="#2563EB" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                    {selectedServiceObj?.name || serviceTitle || 'Dịch vụ đã chọn'}
                  </Text>
                  <Text className="text-[10px] text-neutral-500">
                    {`Ngành: ${selectedCategoryObj?.name || 'Chuyên môn'}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Form nhập thông tin */}
            <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              {/* Tiêu đề hiển thị */}
              <View>
                <Text className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  1. Tiêu đề hiển thị của dịch vụ *
                </Text>
                <TextInput
                  testID="service-title-input"
                  placeholder="Ví dụ: Vệ sinh máy lạnh dân dụng & công nghiệp"
                  value={serviceTitle}
                  onChangeText={setServiceTitle}
                  className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
                />
              </View>

              {/* Số năm kinh nghiệm */}
              <View className="mt-4">
                <Text className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  2. Số năm kinh nghiệm làm việc *
                </Text>
                <TextInput
                  testID="service-experience-input"
                  placeholder="Số năm kinh nghiệm (ví dụ: 3)"
                  keyboardType="numeric"
                  value={experienceYears}
                  onChangeText={setExperienceYears}
                  className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
                />
              </View>

              {/* Mô tả chi tiết & cam kết */}
              <View className="mt-4">
                <Text className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  3. Mô tả chi tiết kỹ năng & Cam kết chất lượng
                </Text>
                <TextInput
                  testID="service-description-input"
                  placeholder="Mô tả các kỹ thuật bạn thành thạo, trang thiết bị chuyên dụng, cam kết bảo hành..."
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                  className="mt-2 min-h-[75px] rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
                />
              </View>

              {/* Khu vực nhận việc & bán kính */}
              <View className="mt-4">
                <Text className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  4. Khu vực nhận việc & Bán kính phục vụ *
                </Text>

                {/* Ô nhập/hiển thị địa chỉ */}
                <View className="mt-2 flex-row items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-800">
                  <MapPinIcon size={16} color="#EF4444" />
                  <TextInput
                    testID="service-address-input"
                    placeholder="Địa chỉ trung tâm nhận việc"
                    value={workAddress}
                    onChangeText={setWorkAddress}
                    className="ml-2 flex-1 text-xs text-neutral-900 dark:text-white"
                  />
                </View>

                {/* Tọa độ hiện tại */}
                <View className="mt-1 flex-row items-center justify-between px-1">
                  <Text className="text-[10px] text-neutral-400">
                    {`Tọa độ GPS: ${workCoords.latitude.toFixed(5)}, ${workCoords.longitude.toFixed(5)}`}
                  </Text>
                </View>

                {/* 2 nút thao tác vị trí: Vị trí GPS hiện tại & Chọn trên bản đồ */}
                <View className="mt-2.5 flex-row items-center gap-2">
                  <Pressable
                    testID="get-current-location-btn"
                    onPress={() => fetchDeviceLocation(true)}
                    disabled={isLocating}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 py-2.5 active:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40"
                  >
                    {isLocating
                      ? (
                          <ActivityIndicator size="small" color="#2563EB" />
                        )
                      : (
                          <GpsIcon size={15} color="#2563EB" />
                        )}
                    <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {isLocating
                        ? 'Đang định vị...'
                        : 'Vị trí hiện tại'}
                    </Text>
                  </Pressable>

                  <Pressable
                    testID="open-map-picker-btn"
                    onPress={handleOpenMapModal}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2.5 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
                  >
                    <MapIcon size={15} color="#374151" />
                    <Text className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Chọn trên bản đồ
                    </Text>
                  </Pressable>
                </View>

                {/* Lựa chọn bán kính phục vụ */}
                <View className="mt-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Bán kính nhận việc:
                    </Text>
                    <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {`${radiusKm} km`}
                    </Text>
                  </View>

                  <View className="mt-2 flex-row items-center gap-2">
                    {RADIUS_OPTIONS.map(km => (
                      <Pressable
                        key={km}
                        testID={`radius-option-${km}`}
                        onPress={() => setRadiusKm(km)}
                        className={`flex-1 items-center justify-center rounded-xl py-2.5 ${radiusKm === km
                          ? 'bg-blue-600 shadow-2xs'
                          : 'border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${radiusKm === km
                            ? 'text-white'
                            : 'text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {`${km}km`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text className="mt-1.5 text-[11px] text-neutral-400">
                    {`Hệ thống sẽ gợi ý đơn đặt dịch vụ trong phạm vi bán kính ${radiusKm}km tính từ vị trí nhận việc của bạn.`}
                  </Text>
                </View>
              </View>

              {/* Nút Tiếp tục sang Bước 4 */}
              <Button
                testID="step-3-next-btn"
                label="Tiếp tục sang bước Minh chứng"
                variant="default"
                className="mt-6 w-full bg-blue-600 active:bg-blue-700"
                textClassName="text-white font-bold"
                onPress={() => {
                  if (!serviceTitle.trim()) {
                    Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề hiển thị của dịch vụ.');
                    return;
                  }
                  setCurrentStep(4);
                }}
              />

              <Button
                testID="step-3-back-btn"
                label="Quay lại chọn dịch vụ"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full"
                onPress={() => setCurrentStep(2)}
              />
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {/* BƯỚC 4: TẢI MINH CHỨNG TAY NGHỀ (ẢNH/VIDEO) & GỬI DUYỆT      */}
        {/* ============================================================ */}
        {currentStep === 4 && (
          <View testID="step-4-evidence-container" className="p-4">
            <View className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
              <View className="flex-row items-center gap-2">
                <View className="size-7 items-center justify-center rounded-lg bg-blue-600">
                  <CameraIcon size={14} color="#FFFFFF" />
                </View>
                <Text className="text-sm font-bold text-blue-900 dark:text-blue-200">
                  Bước 4: Minh chứng tay nghề & trang thiết bị
                </Text>
              </View>
              <Text className="mt-1 text-xs/relaxed text-blue-800 dark:text-blue-300">
                Chụp ảnh đồ nghề thực tế, chứng chỉ nghề hoặc quay video thao tác để Admin xét duyệt nhanh chóng nhất.
              </Text>
            </View>

            <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              {/* Action Buttons: Thư viện & Camera */}
              <View className="flex-row gap-2.5">
                <Pressable
                  testID="pick-from-library-btn"
                  onPress={handlePickFromLibrary}
                  disabled={isUploadingFile}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 py-3 active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40"
                >
                  <PlusIcon size={16} color="#2563EB" />
                  <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Chọn từ thư viện
                  </Text>
                </Pressable>

                <Pressable
                  testID="pick-from-camera-btn"
                  onPress={handlePickFromCamera}
                  disabled={isUploadingFile}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 py-3 active:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40"
                >
                  <CameraIcon size={16} color="#059669" />
                  <Text className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Quay / Chụp ảnh
                  </Text>
                </Pressable>
              </View>

              {/* Loading upload */}
              {isUploadingFile && (
                <View className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-neutral-100 p-2.5 dark:bg-neutral-800">
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    Đang tải tệp minh chứng lên hệ thống...
                  </Text>
                </View>
              )}

              {/* Danh sách ảnh/video minh chứng đã tải lên (chỉ hiển thị ảnh và nút X) */}
              {evidenceList.length > 0 && (
                <View className="mt-4">
                  <Text className="mb-2.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    {`Ảnh/Video minh chứng đã chọn (${evidenceList.length}):`}
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {evidenceList.map((item, idx) => (
                      <View
                        key={item.id}
                        testID={`evidence-item-${idx}`}
                        className="relative size-20 rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
                      >
                        {item.fileType === 'image' && (
                          <Image
                            source={{ uri: item.url }}
                            className="size-full rounded-2xl"
                            contentFit="cover"
                          />
                        )}
                        {item.fileType === 'video' && (
                          <View className="size-full items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950">
                            <Text className="text-xs font-bold text-purple-700 dark:text-purple-300">
                              VIDEO
                            </Text>
                          </View>
                        )}

                        {/* Nút X xóa ảnh */}
                        <Pressable
                          testID={`remove-evidence-btn-${idx}`}
                          onPress={() => handleRemoveEvidence(idx)}
                          className="absolute -top-1.5 -right-1.5 size-6 items-center justify-center rounded-full bg-red-600 shadow-sm active:bg-red-700"
                        >
                          <CloseIcon size={12} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Dán liên kết trực tuyến */}
              <View className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <Text className="text-[11px] text-neutral-500">
                  Hoặc dán liên kết bằng chứng trực tuyến (Youtube, Google Drive...):
                </Text>
                <View className="mt-1.5 flex-row items-center gap-2">
                  <TextInput
                    testID="service-evidence-input"
                    placeholder="https://..."
                    value={manualEvidenceUrl}
                    onChangeText={setManualEvidenceUrl}
                    className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
                  />
                  <Button
                    testID="add-evidence-url-btn"
                    label="Thêm link"
                    size="sm"
                    variant="outline"
                    onPress={handleAddManualUrl}
                  />
                </View>
              </View>

              {/* NÚT GỬI HỒ SƠ ĐĂNG KÝ */}
              <Button
                testID="submit-service-registration-btn"
                label={
                  isSubmitting
                    ? 'Đang gửi hồ sơ...'
                    : isEditing
                      ? 'Cập nhật đơn đăng ký'
                      : 'Gửi đơn đăng ký dịch vụ'
                }
                variant="default"
                disabled={isSubmitting || isUploadingFile}
                className="mt-6 w-full bg-blue-600 active:bg-blue-700"
                textClassName="text-white font-bold"
                onPress={handleSubmitRegistration}
              />

              {/* Nút quay lại bước 3 */}
              <Button
                testID="step-4-back-btn"
                label="Quay lại bước trước"
                variant="outline"
                size="sm"
                className="mt-2.5 w-full"
                onPress={() => setCurrentStep(3)}
              />
            </View>
          </View>
        )}
        {/* Modal chọn vị trí nhận việc trên bản đồ (Giao diện bottom-sheet thu gọn) */}
        <Modal
          visible={isMapModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setIsMapModalVisible(false)}
        >
          <View className="flex-1 justify-end bg-black/60">
            {/* Vùng nền mờ phía trên để bấm đóng modal */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng modal bản đồ"
              className="flex-1"
              onPress={() => setIsMapModalVisible(false)}
            />

            {/* Container bản đồ nhỏ gọn, bo góc mềm mại, chiếm khoảng 80% màn hình */}
            <View
              testID="map-picker-modal"
              className="h-[80%] w-full overflow-hidden rounded-t-[28px] bg-white shadow-2xl dark:bg-neutral-900"
            >
              {/* Tay nắm kéo (Drag handle bar) */}
              <View className="items-center pt-2.5 pb-1">
                <View className="h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700" />
              </View>

              {/* Header Modal */}
              <View className="h-12 flex-row items-center justify-between border-b border-neutral-100 px-4 dark:border-neutral-800">
                <View className="flex-row items-center gap-2">
                  <MapPinIcon size={18} color="#2563EB" />
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Chọn khu vực nhận việc
                  </Text>
                </View>
                <Pressable
                  testID="close-map-modal-btn"
                  onPress={() => setIsMapModalVisible(false)}
                  className="size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
                >
                  <CloseIcon size={16} color="#4B5563" />
                </Pressable>
              </View>

              {/* Khung bản đồ tương tác với Center Pin */}
              <View className="relative flex-1">
                <HandyMap
                  testID="worker-register-map"
                  center={mapCoords}
                  showCenterPin
                  zoomLevel={15}
                  interactive
                  onRegionDidChange={handleMapRegionChange}
                  style={{ flex: 1 }}
                />

                {/* Nút GPS nhảy về vị trí hiện tại trên Map */}
                <Pressable
                  testID="map-my-location-btn"
                  onPress={() => fetchDeviceLocation(true)}
                  className="absolute right-4 bottom-5 size-11 items-center justify-center rounded-full bg-white shadow-lg active:bg-neutral-100 dark:bg-neutral-800 dark:active:bg-neutral-700"
                >
                  {isLocating
                    ? (
                        <ActivityIndicator size="small" color="#2563EB" />
                      )
                    : (
                        <GpsIcon size={20} color="#2563EB" />
                      )}
                </Pressable>
              </View>

              {/* Thanh địa chỉ & nút xác nhận vị trí được nâng cao cách đáy an toàn */}
              <View className="border-t border-neutral-200 bg-white p-4 pt-3.5 pb-12 dark:border-neutral-800 dark:bg-neutral-900">
                <View className="mb-3.5 flex-row items-start gap-2.5">
                  <View className="mt-0.5">
                    <MapPinIcon size={16} color="#EF4444" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold text-neutral-500">
                      Địa chỉ tại tâm ghim bản đồ:
                    </Text>
                    {isReverseGeocoding
                      ? (
                          <View className="flex-row items-center gap-2 pt-1">
                            <ActivityIndicator size="small" color="#2563EB" />
                            <Text className="text-xs text-neutral-400">Đang tra cứu địa chỉ...</Text>
                          </View>
                        )
                      : (
                          <Text
                            testID="map-selected-address-text"
                            className="text-xs font-bold text-neutral-900 dark:text-white"
                            numberOfLines={2}
                          >
                            {mapAddress || 'Chưa xác định'}
                          </Text>
                        )}
                    <Text className="mt-0.5 text-[10px] text-neutral-400">
                      {`Tọa độ: ${mapCoords.latitude.toFixed(5)}, ${mapCoords.longitude.toFixed(5)}`}
                    </Text>
                  </View>
                </View>

                {/* Nút bấm xác nhận vị trí được nâng lên cao hơn so với đáy */}
                <Button
                  testID="confirm-map-location-btn"
                  label="Xác nhận vị trí này"
                  variant="default"
                  className="h-12 w-full rounded-2xl bg-blue-600 shadow-md shadow-blue-200 active:bg-blue-700 dark:shadow-none"
                  textClassName="text-sm font-bold text-white"
                  onPress={handleConfirmMapLocation}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}
