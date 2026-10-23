import { create } from 'zustand';

interface VerificationState {
  isVisible: boolean;
  verificationUrl: string | null;
  setVerification: (url: string | null) => void;
  hide: () => void;
}

export const useVerificationStore = create<VerificationState>((set) => ({
  isVisible: false,
  verificationUrl: null,
  setVerification: (url) => {
    if (url) {
      set({ isVisible: true, verificationUrl: url });
    } else {
      set({ isVisible: false, verificationUrl: null });
    }
  },
  hide: () => set({ isVisible: false, verificationUrl: null }),
}));
