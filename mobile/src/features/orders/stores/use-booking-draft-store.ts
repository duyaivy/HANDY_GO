import type { ServiceSuggestionGroup } from '@/features/catalog/types';
import { create } from 'zustand';
import { resolveServiceName } from '@/constants/services';

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
  selectedWorkerId: string;
  agreedPrice: number;
  createdRequestId: string | null;

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
  resetDraft: () => void;
};

function DEFAULT_SCHEDULED_AT() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export const useBookingDraftStore = create<BookingDraftState>(set => ({
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
  aiRefPriceMin: 150000,
  aiRefPriceMax: 350000,
  selectedWorkerId: '',
  agreedPrice: 300000,
  createdRequestId: null,

  setService: (serviceId, serviceName, meta) =>
    set((state) => {
      const isSwitchingService = Boolean(
        state.serviceId && serviceId && state.serviceId !== serviceId,
      );
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
      };
    }),

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

  setDescription: description => set({ description }),

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

  resetDraft: () =>
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
      aiRefPriceMin: 150000,
      aiRefPriceMax: 350000,
      selectedWorkerId: '',
      agreedPrice: 300000,
      createdRequestId: null,
    }),
}));
