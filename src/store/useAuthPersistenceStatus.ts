import { create } from 'zustand';

/** In-memory only; a read failure must never persist an empty account list. */
export const useAuthPersistenceStatus = create<{
  failed: boolean;
  setFailed: (failed: boolean) => void;
}>((set) => ({ failed: false, setFailed: (failed) => set({ failed }) }));
