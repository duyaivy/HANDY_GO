import { create } from 'zustand';
import { resolveServiceName } from '@/constants/services';
import { OrdersApi } from '../api/orders.api';

export type BookingDraftState = {
  serviceId: string;
  serviceName: string;
  description: string;
  addressText: string;
  latitude: number;
  longitude: number;
  scheduledAt: string;
  mediaUrls: string[];
  aiRefPriceMin: number;
  aiRefPriceMax: number;
  isEstimatingPrice: boolean;
  priceEstimateReason: string | null;
  selectedWorkerId: string;
  agreedPrice: number;
  createdRequestId: string | null;

  setService: (id: string, name?: string) => void;
  setDescription: (desc: string) => void;
  setAddress: (address: string, lat?: number, lng?: number) => void;
  setScheduledAt: (dateIso: string) => void;
  addMediaUrl: (url: string) => void;
  removeMediaUrl: (url: string) => void;
  replaceMediaUrl: (oldUrl: string, newUrl: string) => void;
  setSelectedWorker: (workerId: string, price?: number) => void;
  setCreatedRequestId: (id: string | null) => void;
  fetchEstimatedPrice: (serviceId?: string, description?: string) => Promise<void>;
  waitForEstimate: () => Promise<void>;
  resetDraft: () => void;
};

const DEFAULT_MIN_PRICE = 150000;
const DEFAULT_MAX_PRICE = 350000;

function DEFAULT_SCHEDULED_AT() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

let currentDraftToken = 1;
let latestRequestId = 0;
let activeAbortController: AbortController | null = null;
let activeEstimatePromise: Promise<void> | null = null;

export const useBookingDraftStore = create<BookingDraftState>((set, get) => ({
  serviceId: '',
  serviceName: 'Dịch vụ tiện ích',
  description: '',
  addressText: '',
  latitude: 16.0748,
  longitude: 108.1499,
  scheduledAt: DEFAULT_SCHEDULED_AT(),
  mediaUrls: [],
  aiRefPriceMin: DEFAULT_MIN_PRICE,
  aiRefPriceMax: DEFAULT_MAX_PRICE,
  isEstimatingPrice: false,
  priceEstimateReason: null,
  selectedWorkerId: '',
  agreedPrice: 300000,
  createdRequestId: null,

  setService: (serviceId, serviceName) => {
    const prevServiceId = get().serviceId;
    if (serviceId !== prevServiceId) {
      latestRequestId++;
      if (activeAbortController) {
        try {
          activeAbortController.abort();
        }
        catch {
          // ignore
        }
        activeAbortController = null;
      }
      activeEstimatePromise = null;

      set(state => ({
        serviceId,
        serviceName: resolveServiceName(
          serviceId,
          serviceName || (state.serviceName !== 'Dịch vụ tiện ích' ? state.serviceName : undefined),
        ),
        aiRefPriceMin: DEFAULT_MIN_PRICE,
        aiRefPriceMax: DEFAULT_MAX_PRICE,
        isEstimatingPrice: false,
        priceEstimateReason: null,
      }));
    }
    else {
      set(state => ({
        serviceId,
        serviceName: resolveServiceName(
          serviceId,
          serviceName || (state.serviceName !== 'Dịch vụ tiện ích' ? state.serviceName : undefined),
        ),
      }));
    }
  },

  setDescription: (description) => {
    const prevDescription = get().description;
    const normalizedNew = description.trim();
    const normalizedPrev = prevDescription.trim();

    if (normalizedNew === normalizedPrev) {
      set({ description });
      return;
    }

    latestRequestId++;
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      }
      catch {
        // ignore
      }
      activeAbortController = null;
    }
    activeEstimatePromise = null;

    set({
      description,
      aiRefPriceMin: DEFAULT_MIN_PRICE,
      aiRefPriceMax: DEFAULT_MAX_PRICE,
      isEstimatingPrice: false,
      priceEstimateReason: null,
    });
  },

  setAddress: (addressText, latitude = 16.0748, longitude = 108.1499) =>
    set({ addressText, latitude, longitude }),

  setScheduledAt: scheduledAt => set({ scheduledAt }),

  addMediaUrl: url =>
    set(state => ({ mediaUrls: [...state.mediaUrls, url] })),

  removeMediaUrl: url =>
    set(state => ({
      mediaUrls: state.mediaUrls.filter(item => item !== url),
    })),

  replaceMediaUrl: (oldUrl, newUrl) =>
    set(state => ({
      mediaUrls: state.mediaUrls.map(item => (item === oldUrl ? newUrl : item)),
    })),

  setSelectedWorker: (selectedWorkerId, agreedPrice = 300000) =>
    set({ selectedWorkerId, agreedPrice }),

  setCreatedRequestId: createdRequestId => set({ createdRequestId }),

  fetchEstimatedPrice: async (overrideServiceId?: string, overrideDescription?: string) => {
    const currentServiceId = overrideServiceId ?? get().serviceId;
    const currentDescription = overrideDescription ?? get().description;
    if (!currentServiceId) {
      return;
    }

    if (activeAbortController) {
      try {
        activeAbortController.abort();
      }
      catch {
        // ignore
      }
    }
    const controller = new AbortController();
    activeAbortController = controller;

    const thisDraftToken = currentDraftToken;
    const thisRequestId = ++latestRequestId;
    const thisServiceId = currentServiceId;
    const thisDescription = currentDescription.trim();

    set({ isEstimatingPrice: true });

    const promise = (async () => {
      try {
        const res = await OrdersApi.estimatePrice(
          {
            serviceId: currentServiceId,
            description: currentDescription,
          },
          { signal: controller.signal },
        );

        if (thisDraftToken !== currentDraftToken || thisRequestId !== latestRequestId) {
          return;
        }

        const currentState = get();
        if (
          (currentState.serviceId && currentState.serviceId !== thisServiceId)
          || (currentState.description && currentState.description.trim() !== thisDescription)
        ) {
          return;
        }

        if (res?.data && typeof res.data.aiRefPriceMin === 'number' && typeof res.data.aiRefPriceMax === 'number') {
          set({
            aiRefPriceMin: res.data.aiRefPriceMin,
            aiRefPriceMax: res.data.aiRefPriceMax,
            priceEstimateReason: res.data.matchedReason || null,
          });
        }
      }
      catch (error: any) {
        if (thisDraftToken !== currentDraftToken || thisRequestId !== latestRequestId) {
          return;
        }
        console.warn('Failed to fetch estimated price, keeping default/current prices:', error);
      }
      finally {
        if (thisDraftToken === currentDraftToken && thisRequestId === latestRequestId) {
          set({ isEstimatingPrice: false });
          activeEstimatePromise = null;
        }
      }
    })();

    activeEstimatePromise = promise;
    return promise;
  },

  waitForEstimate: async () => {
    if (activeEstimatePromise) {
      try {
        await activeEstimatePromise;
      }
      catch {
        // ignore
      }
    }
  },

  resetDraft: () => {
    currentDraftToken++;
    latestRequestId++;
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      }
      catch {
        // ignore
      }
      activeAbortController = null;
    }
    activeEstimatePromise = null;

    set({
      serviceId: '',
      serviceName: 'Dịch vụ tiện ích',
      description: '',
      addressText: '',
      latitude: 16.0748,
      longitude: 108.1499,
      scheduledAt: DEFAULT_SCHEDULED_AT(),
      mediaUrls: [],
      aiRefPriceMin: DEFAULT_MIN_PRICE,
      aiRefPriceMax: DEFAULT_MAX_PRICE,
      isEstimatingPrice: false,
      priceEstimateReason: null,
      selectedWorkerId: '',
      agreedPrice: 300000,
      createdRequestId: null,
    });
  },
}));
