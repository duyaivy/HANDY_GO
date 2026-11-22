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
});
