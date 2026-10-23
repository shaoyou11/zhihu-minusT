import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ENABLE_READING_PROGRESS } from '@/constants/readingProgress';
import {
  normalizeReadingProgress,
  READING_PROGRESS_STORE_VERSION,
  readingProgressStorage,
} from '@/storage/readingProgressStorage';
import type { ReadingProgressEntry } from '@/utils/readingProgress';

interface ProgressState {
  progress: Record<string, ReadingProgressEntry>;
  saveProgress: (id: string, entry: ReadingProgressEntry) => void;
  removeProgress: (id: string) => void;
  getProgress: (id: string) => ReadingProgressEntry | undefined;
  clearProgress: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      progress: {},

      saveProgress: (id, entry) => {
        if (!id) return;
        const { progress } = get();
        const newProgress = normalizeReadingProgress({
          ...progress,
          [id]: entry,
        });

        set({ progress: newProgress });
      },

      removeProgress: (id) => {
        if (!id || !get().progress[id]) return;
        const nextProgress = { ...get().progress };
        delete nextProgress[id];
        set({ progress: nextProgress });
      },

      getProgress: (id) => {
        if (!id) return undefined;
        return get().progress[id];
      },

      clearProgress: () => set({ progress: {} }),
    }),
    {
      name: 'progress-storage',
      version: READING_PROGRESS_STORE_VERSION,
      storage: createJSONStorage(() => readingProgressStorage),
      skipHydration: !ENABLE_READING_PROGRESS,
      partialize: ({ progress }) => ({ progress }),
      migrate: (persisted: unknown) => ({
        progress: normalizeReadingProgress(
          typeof persisted === 'object' &&
            persisted !== null &&
            'progress' in persisted
            ? persisted.progress
            : undefined,
        ),
      }),
      merge: (persisted, current) => ({
        ...current,
        progress: normalizeReadingProgress(
          typeof persisted === 'object' &&
            persisted !== null &&
            'progress' in persisted
            ? persisted.progress
            : undefined,
        ),
      }),
    },
  ),
);
