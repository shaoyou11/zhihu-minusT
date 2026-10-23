import { useTelemetryStore } from '@/store/useTelemetryStore';
import { setTelemetryEnabled } from './telemetry';

let initialized = false;
let lastSyncedEnabled: boolean | undefined;

function syncTelemetryPreferences(
  state: ReturnType<typeof useTelemetryStore.getState>,
) {
  if (!state.hasHydrated || lastSyncedEnabled === state.enabled) return;
  lastSyncedEnabled = state.enabled;
  void setTelemetryEnabled(state.enabled).catch(() => {
    // An unavailable telemetry SDK must not interrupt startup or opt-out.
  });
}

/** Keep consent in sync even when the root layout cannot commit its effects. */
export function initializeTelemetryPreferences(): void {
  if (initialized) return;
  initialized = true;
  useTelemetryStore.subscribe(syncTelemetryPreferences);
  syncTelemetryPreferences(useTelemetryStore.getState());
}
