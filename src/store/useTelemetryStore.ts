import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const telemetryStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

interface PersistedTelemetryState {
  enabled: boolean;
}

interface TelemetryState extends PersistedTelemetryState {
  hasHydrated: boolean;
  markHydrated: () => void;
  setEnabled: (enabled: boolean) => void;
}

const DEFAULT_TELEMETRY_STATE: PersistedTelemetryState = {
  enabled: true,
};

export const useTelemetryStore = create<TelemetryState>()(
  persist(
    (set) => ({
      ...DEFAULT_TELEMETRY_STATE,
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'zhihu-telemetry-storage',
      storage: createJSONStorage(() => telemetryStorage),
      version: 1,
      partialize: (state): PersistedTelemetryState => ({
        enabled: state.enabled,
      }),
      migrate: (persistedState: unknown) => {
        const state =
          persistedState && typeof persistedState === 'object'
            ? (persistedState as Record<string, unknown>)
            : {};

        return {
          enabled:
            typeof state.enabled === 'boolean'
              ? state.enabled
              : DEFAULT_TELEMETRY_STATE.enabled,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
