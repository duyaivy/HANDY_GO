import { create } from 'zustand';

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
  description: '',
  addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
  latitude: 16.0748,
  longitude: 108.1499,
  scheduledAt: DEFAULT_SCHEDULED_AT(),
  mediaUrls: [],
  aiRefPriceMin: 150000,
  aiRefPriceMax: 350000,
  selectedWorkerId: '',
  agreedPrice: 300000,
  createdRequestId: null,

  setService: (serviceId, serviceName = 'Dịch vụ tiện ích') =>
    set({ serviceId, serviceName }),

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
      description: '',
      addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
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
