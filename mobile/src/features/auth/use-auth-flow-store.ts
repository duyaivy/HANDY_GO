import { create } from 'zustand';

export type AuthFlowRole = 'Customer' | 'Worker';

export type AuthFlowState = {
  phone: string;
  countryCode: string;
  otp: string;
  pin: string;
  fullName: string;
  referralCode: string;
  targetRole: AuthFlowRole | null;

  setPhone: (phone: string, countryCode?: string) => void;
  setOtp: (otp: string) => void;
  setPin: (pin: string) => void;
  setProfile: (fullName: string, referralCode?: string) => void;
  setTargetRole: (role: AuthFlowRole | null) => void;
  resetFlow: () => void;
};

const initialState = {
  phone: '',
  countryCode: '+84',
  otp: '',
  pin: '',
  fullName: '',
  referralCode: '',
  targetRole: null as AuthFlowRole | null,
};

export const useAuthFlowStore = create<AuthFlowState>(set => ({
  ...initialState,
  setPhone: (phone, countryCode = '+84') => set({ phone, countryCode }),
  setOtp: otp => set({ otp }),
  setPin: pin => set({ pin }),
  setProfile: (fullName, referralCode = '') => set({ fullName, referralCode }),
  setTargetRole: targetRole => set({ targetRole }),
  resetFlow: () => set(initialState),
}));
