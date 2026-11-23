import { OrdersApi } from '../../api/orders.api';
import { useBookingDraftStore } from '../use-booking-draft-store';

jest.mock('../../api/orders.api', () => ({
  OrdersApi: {
    estimatePrice: jest.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useBookingDraftStore - Pricing Estimation & Concurrency', () => {
  it('keeps server prices when an aborted preview still returns a response', async () => {
    const preview = createDeferred<any>();
    jest.mocked(OrdersApi.estimatePrice).mockReturnValueOnce(preview.promise);
    const pending = useBookingDraftStore.getState().fetchEstimatedPrice('srv-a', 'Description A');
    const signal = jest.mocked(OrdersApi.estimatePrice).mock.calls[0][1]?.signal;

    useBookingDraftStore.getState().acceptServerPrices(200000, 450000);
    expect(signal?.aborted).toBe(true);
    preview.resolve({ data: { aiRefPriceMin: 100000, aiRefPriceMax: 300000, matchedReason: 'stale' } });
    await pending;

    expect(useBookingDraftStore.getState()).toMatchObject({
      aiRefPriceMin: 200000,
      aiRefPriceMax: 450000,
      isEstimatingPrice: false,
      priceEstimateReason: null,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useBookingDraftStore.getState().resetDraft();
  });

  it('ensures response A arriving after response B does not overwrite B (race condition)', async () => {
    const deferredA = createDeferred<any>();
    const deferredB = createDeferred<any>();

    jest.mocked(OrdersApi.estimatePrice)
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise);

    // 1. Request A starts
    const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-a', 'Description A');

    // 2. Request B starts shortly after
    const promiseB = useBookingDraftStore.getState().fetchEstimatedPrice('srv-b', 'Description B');

    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    // 3. Request B finishes first
    deferredB.resolve({
      data: {
        aiRefPriceMin: 300000,
        aiRefPriceMax: 600000,
        matchedReason: 'Benchmark B',
        isFallback: false,
      },
    });
    await promiseB;

    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(300000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(600000);
    expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Benchmark B');

    // 4. Request A finishes late
    deferredA.resolve({
      data: {
        aiRefPriceMin: 180000,
        aiRefPriceMax: 350000,
        matchedReason: 'Benchmark A',
        isFallback: false,
      },
    });
    await promiseA;

    // Must NOT overwrite B's results
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(300000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(600000);
    expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Benchmark B');
  });

  it('ensures late response of a reset draft does not alter price or loading of the new draft', async () => {
    const deferredA = createDeferred<any>();

    jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferredA.promise);

    // 1. Request A starts
    const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-a', 'Description A');
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    // 2. User resets draft (e.g., cancels or creates new booking)
    useBookingDraftStore.getState().resetDraft();
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);

    // 3. Request A finally completes
    deferredA.resolve({
      data: {
        aiRefPriceMin: 500000,
        aiRefPriceMax: 900000,
        matchedReason: 'Old draft estimate',
      },
    });
    await promiseA;

    // Must keep reset defaults and not turn loading off on future state
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);
    expect(useBookingDraftStore.getState().priceEstimateReason).toBeNull();
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
  });

  it('keeps isEstimatingPrice true when older overlapping request finishes while latest is still pending', async () => {
    const deferredA = createDeferred<any>();
    const deferredB = createDeferred<any>();

    jest.mocked(OrdersApi.estimatePrice)
      .mockImplementationOnce(() => deferredA.promise)
      .mockImplementationOnce(() => deferredB.promise);

    const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Desc 1');
    const promiseB = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Desc 2');

    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    // Request A completes, but Request B is still pending
    deferredA.resolve({
      data: {
        aiRefPriceMin: 190000,
        aiRefPriceMax: 320000,
      },
    });
    await promiseA;

    // Loading should STILL be true because latest request B is running
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    // Request B completes
    deferredB.resolve({
      data: {
        aiRefPriceMin: 210000,
        aiRefPriceMax: 410000,
      },
    });
    await promiseB;

    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(210000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(410000);
  });

  it('invalidates in-flight requests and resets prices when setService switches service', async () => {
    const deferredA = createDeferred<any>();
    jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferredA.promise);

    useBookingDraftStore.getState().setService('srv-old', 'Dịch vụ cũ');
    const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-old', 'Mô tả');

    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    // Switch to a different service
    useBookingDraftStore.getState().setService('srv-new', 'Dịch vụ mới');

    expect(useBookingDraftStore.getState().serviceId).toBe('srv-new');
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);

    deferredA.resolve({
      data: {
        aiRefPriceMin: 450000,
        aiRefPriceMax: 850000,
      },
    });
    await promiseA;

    // Must not apply srv-old prices to srv-new
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);
  });

  it('allows waitForEstimate to wait for in-flight estimation', async () => {
    const deferred = createDeferred<any>();
    jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferred.promise);

    useBookingDraftStore.getState().fetchEstimatedPrice('srv-test', 'Fix pipe');
    expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

    let waitFinished = false;
    const waitPromise = useBookingDraftStore.getState().waitForEstimate().then(() => {
      waitFinished = true;
    });

    expect(waitFinished).toBe(false);

    deferred.resolve({
      data: {
        aiRefPriceMin: 220000,
        aiRefPriceMax: 420000,
      },
    });

    await waitPromise;
    expect(waitFinished).toBe(true);
    expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(220000);
    expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(420000);
  });

  describe('HG96-REM-03 - Description change invalidation & concurrency', () => {
    it('invalidates pending request when setDescription is called with different text', async () => {
      const deferredA = createDeferred<any>();
      jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferredA.promise);

      useBookingDraftStore.getState().setService('srv-1', 'Sửa máy lạnh');
      useBookingDraftStore.getState().setDescription('Description A');

      const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Description A');
      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

      // Customer edits description while request A is pending
      useBookingDraftStore.getState().setDescription('Description B');

      // State immediately invalidates active estimate and resets to defaults
      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBeNull();

      // Request A finishes late
      deferredA.resolve({
        data: {
          aiRefPriceMin: 280000,
          aiRefPriceMax: 500000,
          matchedReason: 'Estimate for Description A',
        },
      });
      await promiseA;

      // Must NOT apply Description A results
      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBeNull();
      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(false);
    });

    it('clears prior price reason and resets to default when description changes after completion', async () => {
      const deferredA = createDeferred<any>();
      jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferredA.promise);

      useBookingDraftStore.getState().setService('srv-1', 'Sửa máy lạnh');
      useBookingDraftStore.getState().setDescription('Description A');

      const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Description A');
      deferredA.resolve({
        data: {
          aiRefPriceMin: 220000,
          aiRefPriceMax: 380000,
          matchedReason: 'Benchmark Description A',
        },
      });
      await promiseA;

      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(220000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(380000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Benchmark Description A');

      // User modifies description
      useBookingDraftStore.getState().setDescription('Description B');

      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(150000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(350000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBeNull();
    });

    it('handles same service concurrent estimates for different descriptions properly', async () => {
      const deferredA = createDeferred<any>();
      const deferredB = createDeferred<any>();

      jest.mocked(OrdersApi.estimatePrice)
        .mockImplementationOnce(() => deferredA.promise)
        .mockImplementationOnce(() => deferredB.promise);

      useBookingDraftStore.getState().setService('srv-1', 'Sửa máy lạnh');

      const promiseA = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Description A');
      const promiseB = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Description B');

      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

      // B finishes first
      deferredB.resolve({
        data: {
          aiRefPriceMin: 310000,
          aiRefPriceMax: 620000,
          matchedReason: 'Benchmark B',
        },
      });
      await promiseB;

      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(310000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(620000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Benchmark B');

      // A finishes late
      deferredA.resolve({
        data: {
          aiRefPriceMin: 180000,
          aiRefPriceMax: 350000,
          matchedReason: 'Benchmark A',
        },
      });
      await promiseA;

      // Final state must remain B
      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(310000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(620000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Benchmark B');
    });

    it('does not invalidate active estimate if description change is whitespace-only', async () => {
      const deferred = createDeferred<any>();
      jest.mocked(OrdersApi.estimatePrice).mockImplementationOnce(() => deferred.promise);

      useBookingDraftStore.getState().setService('srv-1', 'Sửa ống nước');
      useBookingDraftStore.getState().setDescription('Mô tả');

      const promise = useBookingDraftStore.getState().fetchEstimatedPrice('srv-1', 'Mô tả');
      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

      // Whitespace only
      useBookingDraftStore.getState().setDescription('  Mô tả  ');
      expect(useBookingDraftStore.getState().isEstimatingPrice).toBe(true);

      deferred.resolve({
        data: {
          aiRefPriceMin: 200000,
          aiRefPriceMax: 400000,
          matchedReason: 'Hợp lệ',
        },
      });
      await promise;

      expect(useBookingDraftStore.getState().aiRefPriceMin).toBe(200000);
      expect(useBookingDraftStore.getState().aiRefPriceMax).toBe(400000);
      expect(useBookingDraftStore.getState().priceEstimateReason).toBe('Hợp lệ');
    });
  });
});

describe('useBookingDraftStore - startBookingForService (HG-95)', () => {
  const groupsB = [
    { key: 'issue_b', label: 'Tình trạng B', selectionMode: 'single' as const, options: ['B1', 'B2'] },
  ];

  beforeEach(() => {
    useBookingDraftStore.getState().resetDraft();
  });

  function fillDraftForServiceA() {
    const store = useBookingDraftStore.getState();
    store.startBookingForService('srv-a', 'Dịch vụ A', { categoryId: 'cat-a', categoryName: 'Danh mục A' });
    store.setDescription('Mô tả của dịch vụ A');
    store.addMediaUrl('https://cdn.example.com/a.jpg');
    store.setAddress('12 Đường A', 16.1, 108.2);
    store.setScheduledAt('2030-01-01T02:00:00.000Z');
  }

  it('does not carry booking data of service A over to service B (no request created yet)', () => {
    fillDraftForServiceA();
    expect(useBookingDraftStore.getState().createdRequestId).toBeNull();

    useBookingDraftStore.getState().startBookingForService('srv-b', 'Dịch vụ B', {
      categoryId: 'cat-b',
      categoryName: 'Danh mục B',
      serviceSuggestionGroups: groupsB,
      categorySuggestionGroups: null,
    });

    const state = useBookingDraftStore.getState();
    expect(state).toMatchObject({
      serviceId: 'srv-b',
      serviceName: 'Dịch vụ B',
      categoryId: 'cat-b',
      categoryName: 'Danh mục B',
      serviceSuggestionGroups: groupsB,
      description: '',
      mediaUrls: [],
      addressText: '',
    });
    expect(state.scheduledAt).not.toBe('2030-01-01T02:00:00.000Z');
  });

  it('keeps the in-progress draft when re-entering the same service without a created request', () => {
    fillDraftForServiceA();

    useBookingDraftStore.getState().startBookingForService('srv-a', 'Dịch vụ A');

    expect(useBookingDraftStore.getState()).toMatchObject({
      serviceId: 'srv-a',
      description: 'Mô tả của dịch vụ A',
      mediaUrls: ['https://cdn.example.com/a.jpg'],
      addressText: '12 Đường A',
    });
  });

  it('resets a draft whose request was already created, while keeping new API suggestion metadata', () => {
    fillDraftForServiceA();
    useBookingDraftStore.getState().setCreatedRequestId('req-old');

    useBookingDraftStore.getState().startBookingForService('srv-a', 'Dịch vụ A', {
      serviceSuggestionGroups: groupsB,
    });

    expect(useBookingDraftStore.getState()).toMatchObject({
      serviceId: 'srv-a',
      createdRequestId: null,
      description: '',
      mediaUrls: [],
      serviceSuggestionGroups: groupsB,
    });
  });
});
