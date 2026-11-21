import { OrdersApi } from '../api/orders.api';
import { useBookingDraftStore } from '../stores/use-booking-draft-store';

describe('useBookingDraftStore - Price Estimation', () => {
  beforeEach(() => {
    useBookingDraftStore.getState().resetDraft();
    jest.clearAllMocks();
  });

  afterEach(() => {
    useBookingDraftStore.getState().resetDraft();
  });

  it('updates aiRefPriceMin and aiRefPriceMax on successful estimation', async () => {
    const estimateSpy = jest.spyOn(OrdersApi, 'estimatePrice').mockResolvedValueOnce({
      statusCode: 200,
      message: 'OK',
      data: {
        aiRefPriceMin: 220000,
        aiRefPriceMax: 380000,
        matchedReason: 'Máy lạnh chảy nước',
        isFallback: false,
      },
    } as any);

    useBookingDraftStore.getState().setService('srv-ac-123', 'Sửa máy lạnh');
    useBookingDraftStore.getState().setDescription('Máy lạnh bị chảy nước nhỏ giọt');

    await useBookingDraftStore.getState().fetchEstimatedPrice();

    expect(estimateSpy).toHaveBeenCalledWith({
      serviceId: 'srv-ac-123',
      description: 'Máy lạnh bị chảy nước nhỏ giọt',
    });

    const state = useBookingDraftStore.getState();
    expect(state.aiRefPriceMin).toBe(220000);
    expect(state.aiRefPriceMax).toBe(380000);
    expect(state.priceEstimateReason).toBe('Máy lạnh chảy nước');
    expect(state.isEstimatingPrice).toBe(false);
  });

  it('gracefully handles API errors by preserving current prices and stopping loading state', async () => {
    jest.spyOn(OrdersApi, 'estimatePrice').mockRejectedValueOnce(new Error('Network error'));

    useBookingDraftStore.getState().setService('srv-ac-123', 'Sửa máy lạnh');
    useBookingDraftStore.setState({
      aiRefPriceMin: 150000,
      aiRefPriceMax: 350000,
    });

    await useBookingDraftStore.getState().fetchEstimatedPrice();

    const state = useBookingDraftStore.getState();
    expect(state.aiRefPriceMin).toBe(150000);
    expect(state.aiRefPriceMax).toBe(350000);
    expect(state.isEstimatingPrice).toBe(false);
  });
});
