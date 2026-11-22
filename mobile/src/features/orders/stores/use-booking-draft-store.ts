import type { ServiceSuggestionGroup } from '@/features/catalog/types';
import { create } from 'zustand';
import { resolveServiceName } from '@/constants/services';
import { OrdersApi } from '../api/orders.api';

export type BookingServiceMeta = {
  categoryId?: string | null;
  categoryName?: string | null;
  serviceSuggestionGroups?: ServiceSuggestionGroup[] | null;
  categorySuggestionGroups?: ServiceSuggestionGroup[] | null;
};

export type BookingDraftState = {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryName: string;
  serviceSuggestionGroups: ServiceSuggestionGroup[] | null;
  categorySuggestionGroups: ServiceSuggestionGroup[] | null;
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
  isPriceConfirmed: boolean;
  lastSyncedDraftSnapshot: string | null;

  setService: (id: string, name?: string, meta?: BookingServiceMeta) => void;
  setSuggestionMetadata: (meta: BookingServiceMeta) => void;
  setDescription: (desc: string) => void;
  setAddress: (address: string, lat?: number, lng?: number) => void;
  setScheduledAt: (dateIso: string) => void;
  addMediaUrl: (url: string) => void;
  removeMediaUrl: (url: string) => void;
  replaceMediaUrl: (oldUrl: string, newUrl: string) => void;
  setSelectedWorker: (workerId: string, price?: number) => void;
  setCreatedRequestId: (id: string | null) => void;
  setIsPriceConfirmed: (confirmed: boolean) => void;
  setLastSyncedDraftSnapshot: (snapshot: string | null) => void;
  fetchEstimatedPrice: (serviceId?: string, description?: string) => Promise<void>;
  waitForEstimate: () => Promise<void>;
  acceptServerPrices: (min: number, max: number) => void;
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
  categoryId: '',
  categoryName: '',
  serviceSuggestionGroups: null,
  categorySuggestionGroups: null,
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
  isPriceConfirmed: false,
  lastSyncedDraftSnapshot: null,

  setService: (serviceId, serviceName, meta) => {
    const prevServiceId = get().serviceId;
    const isSwitchingService = Boolean(prevServiceId && serviceId && serviceId !== prevServiceId);

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

      set((state) => {
        const fallbackPreviousName = !isSwitchingService && state.serviceName !== 'Dịch vụ tiện ích'
          ? state.serviceName
          : undefined;
        return {
          serviceId,
          serviceName: resolveServiceName(
            serviceId,
            serviceName || fallbackPreviousName,
          ),
          categoryId:
            meta?.categoryId !== undefined
              ? (meta.categoryId ?? '')
              : (isSwitchingService ? '' : state.categoryId),
          categoryName:
            meta?.categoryName !== undefined
              ? (meta.categoryName ?? '')
              : (isSwitchingService ? '' : state.categoryName),
          serviceSuggestionGroups:
            meta?.serviceSuggestionGroups !== undefined
              ? (meta.serviceSuggestionGroups ?? null)
              : (isSwitchingService ? null : state.serviceSuggestionGroups),
          categorySuggestionGroups:
            meta?.categorySuggestionGroups !== undefined
              ? (meta.categorySuggestionGroups ?? null)
              : (isSwitchingService ? null : state.categorySuggestionGroups),
          aiRefPriceMin: DEFAULT_MIN_PRICE,
          aiRefPriceMax: DEFAULT_MAX_PRICE,
          isEstimatingPrice: false,
          priceEstimateReason: null,
          isPriceConfirmed: false,
        };
      });
    }
    else {
      set(state => ({
        serviceId,
        serviceName: resolveServiceName(
          serviceId,
          serviceName || (state.serviceName !== 'Dịch vụ tiện ích' ? state.serviceName : undefined),
        ),
        ...(meta?.categoryId !== undefined ? { categoryId: meta.categoryId ?? '' } : {}),
        ...(meta?.categoryName !== undefined ? { categoryName: meta.categoryName ?? '' } : {}),
        ...(meta?.serviceSuggestionGroups !== undefined
          ? { serviceSuggestionGroups: meta.serviceSuggestionGroups ?? null }
          : {}),
        ...(meta?.categorySuggestionGroups !== undefined
          ? { categorySuggestionGroups: meta.categorySuggestionGroups ?? null }
          : {}),
      }));
    }
  },

  setSuggestionMetadata: meta =>
    set(state => ({
      categoryId: meta.categoryId !== undefined ? (meta.categoryId ?? '') : state.categoryId,
      categoryName: meta.categoryName !== undefined ? (meta.categoryName ?? '') : state.categoryName,
      serviceSuggestionGroups:
        meta.serviceSuggestionGroups !== undefined
          ? (meta.serviceSuggestionGroups ?? null)
          : state.serviceSuggestionGroups,
      categorySuggestionGroups:
        meta.categorySuggestionGroups !== undefined
          ? (meta.categorySuggestionGroups ?? null)
          : state.categorySuggestionGroups,
    })),

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
      isPriceConfirmed: false,
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

  setIsPriceConfirmed: isPriceConfirmed => set({ isPriceConfirmed }),

  setLastSyncedDraftSnapshot: lastSyncedDraftSnapshot => set({ lastSyncedDraftSnapshot }),

  acceptServerPrices: (min, max) => {
    latestRequestId++;
    activeAbortController?.abort();
    activeAbortController = null;
    activeEstimatePromise = null;
    set({
      aiRefPriceMin: min,
      aiRefPriceMax: max,
      isEstimatingPrice: false,
      priceEstimateReason: null,
    });
  },

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
      categoryId: '',
      categoryName: '',
      serviceSuggestionGroups: null,
      categorySuggestionGroups: null,
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
      isPriceConfirmed: false,
      lastSyncedDraftSnapshot: null,
    });
  },
}));
