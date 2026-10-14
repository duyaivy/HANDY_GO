import { create } from 'zustand';

type PasswordResetState = {
  email: string;
  resetToken: string | null;
  setEmail: (email: string) => void;
  setResetToken: (resetToken: string) => void;
  clear: () => void;
};

const initialState = {
  email: '',
  resetToken: null,
};

export const usePasswordResetStore = create<PasswordResetState>(set => ({
  ...initialState,
  setEmail: email => set({ email, resetToken: null }),
  setResetToken: resetToken => set({ resetToken }),
  clear: () => set(initialState),
}));
