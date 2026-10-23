import { createStore, type StoreApi } from 'zustand/vanilla';

interface TestPreferences {
  enabled: boolean;
  hasHydrated: boolean;
}

let mockStore: StoreApi<TestPreferences>;
const mockSetTelemetryEnabled = jest.fn<Promise<void>, [boolean]>();
let initializeTelemetryPreferences: typeof import('../src/utils/telemetryPreferences').initializeTelemetryPreferences;

jest.mock('../src/store/useTelemetryStore', () => ({
  useTelemetryStore: mockStore,
}));
jest.mock('../src/utils/telemetry', () => ({
  setTelemetryEnabled: mockSetTelemetryEnabled,
}));

beforeEach(() => {
  mockStore = createStore<TestPreferences>(() => ({
    enabled: true,
    hasHydrated: false,
  }));
  mockSetTelemetryEnabled.mockReset().mockResolvedValue(undefined);
  jest.isolateModules(() => {
    initializeTelemetryPreferences =
      require('../src/utils/telemetryPreferences').initializeTelemetryPreferences;
  });
});

test('waits for persisted preferences before enabling telemetry without a mounted layout', () => {
  initializeTelemetryPreferences();
  mockStore.setState({ enabled: false });
  mockStore.setState({ enabled: true });
  expect(mockSetTelemetryEnabled).not.toHaveBeenCalled();

  mockStore.setState({ hasHydrated: true });
  expect(mockSetTelemetryEnabled).toHaveBeenCalledTimes(1);
  expect(mockSetTelemetryEnabled).toHaveBeenCalledWith(true);
});

test('immediately applies a stored opt-out when initialization follows hydration', () => {
  mockStore.setState({ enabled: false, hasHydrated: true });

  initializeTelemetryPreferences();

  expect(mockSetTelemetryEnabled).toHaveBeenCalledTimes(1);
  expect(mockSetTelemetryEnabled).toHaveBeenCalledWith(false);
});

test('tracks subsequent consent changes once even after repeated initialization', () => {
  const subscribe = jest.spyOn(mockStore, 'subscribe');
  initializeTelemetryPreferences();
  initializeTelemetryPreferences();
  mockStore.setState({ hasHydrated: true });
  mockStore.setState({ enabled: true });
  initializeTelemetryPreferences();
  mockStore.setState({ enabled: false });
  mockStore.setState({ enabled: false });

  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(mockSetTelemetryEnabled.mock.calls).toEqual([[true], [false]]);
});

test('isolates rejected SDK work and still forwards a later opt-out', async () => {
  mockSetTelemetryEnabled.mockRejectedValueOnce(
    new Error('synthetic unavailable SDK'),
  );
  initializeTelemetryPreferences();
  expect(() => mockStore.setState({ hasHydrated: true })).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();

  expect(() => mockStore.setState({ enabled: false })).not.toThrow();
  expect(mockSetTelemetryEnabled.mock.calls).toEqual([[true], [false]]);
});
