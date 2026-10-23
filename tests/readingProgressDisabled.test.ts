import { act, renderHook } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import {
  AppState,
  type AppStateStatus,
  type LayoutChangeEvent,
  type MeasureOnSuccessCallback,
} from 'react-native';
import { useReadingContentMeasurement } from '../src/hooks/useReadingContentMeasurement';
import { useReadingProgress } from '../src/hooks/useReadingProgress';
import { readingProgressStorage } from '../src/storage/readingProgressStorage';
import { useProgressStore } from '../src/store/useProgressStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => null),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

const contentKey = 'answer:disabled-reading-progress';
const savedEntry = {
  offset: 1200,
  fraction: 0.4,
  scrollableDistance: 3000,
  updatedAt: 123,
};
const viewport = {
  nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 800 } },
} as LayoutChangeEvent;

function expectNoStorageAccess() {
  expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
}

async function prepareProgress(progress: typeof savedEntry | undefined) {
  useProgressStore.setState({
    progress: progress ? { [contentKey]: progress } : {},
  });
  // Seeding the real persisted store writes asynchronously. Drain that setup
  // before checking that the disabled hook makes no further storage accesses.
  await readingProgressStorage.getItem('progress-storage');
  jest.clearAllMocks();
  const state = useProgressStore.getState();
  const saveProgress = jest.spyOn(state, 'saveProgress');
  const removeProgress = jest.spyOn(state, 'removeProgress');
  return { saveProgress, removeProgress };
}

test('does not hydrate reading progress storage when its module is loaded', async () => {
  await act(async () => {
    await Promise.resolve();
  });
  expect(useProgressStore.persist.getOptions().skipHydration).toBe(true);
  expect(useProgressStore.persist.hasHydrated()).toBe(false);
  expectNoStorageAccess();
});

describe('reading progress disabled by default', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Also cover an already-hydrated in-memory store during a hot reload.
    jest.spyOn(useProgressStore.persist, 'hasHydrated').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    ['with a saved entry', savedEntry],
    ['without a saved entry', undefined],
  ] as const)(
    'does not restore or record scrolling %s, including background and unmount',
    async (_label, entry) => {
      const { saveProgress, removeProgress } = await prepareProgress(entry);
      const rehydrate = jest.spyOn(useProgressStore.persist, 'rehydrate');
      const subscribeHydration = jest.spyOn(
        useProgressStore.persist,
        'onFinishHydration',
      );
      const scrollTo = jest.fn();
      const onProgrammaticScroll = jest.fn();
      let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
      const removeAppStateListener = jest.fn();
      const appStateSubscription = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((event, listener) => {
          if (event === 'change') onAppStateChange = listener;
          return { remove: removeAppStateListener };
        });
      const host = await renderHook(() =>
        useReadingProgress({
          contentKey,
          scrollRef: { current: { scrollTo } },
          onProgrammaticScroll,
        }),
      );

      await act(() => {
        host.result.current.onLayout(viewport);
        host.result.current.onContentSizeChange(320, 3800);
        jest.advanceTimersByTime(200);
        host.result.current.onScroll(1600);
        jest.advanceTimersByTime(1200);
        host.result.current.commitProgress();
        host.result.current.scrollToTop();
        onAppStateChange?.('background');
      });
      expect(host.result.current.restoredOffset).toBeNull();
      await host.unmount();
      await act(() => jest.advanceTimersByTime(2000));

      expect(saveProgress).not.toHaveBeenCalled();
      expect(removeProgress).not.toHaveBeenCalled();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(onProgrammaticScroll).not.toHaveBeenCalled();
      expect(rehydrate).not.toHaveBeenCalled();
      expect(subscribeHydration).not.toHaveBeenCalled();
      expect(useProgressStore.getState().progress[contentKey]).toEqual(entry);
      expect(appStateSubscription).not.toHaveBeenCalled();
      expect(removeAppStateListener).not.toHaveBeenCalled();
      expectNoStorageAccess();
    },
  );

  it('keeps native content measurements available for the reading scrollbar', async () => {
    const { saveProgress, removeProgress } = await prepareProgress(savedEntry);
    const scrollTo = jest.fn();
    const onContentMeasured = jest.fn();
    const measurements: MeasureOnSuccessCallback[] = [];
    const contentRef = {
      current: {
        measure: jest.fn((callback: MeasureOnSuccessCallback) => {
          measurements.push(callback);
        }),
      },
    };
    const layoutSource = { content: '<p>合成正文</p>' };
    const host = await renderHook(() => {
      const progress = useReadingProgress({
        contentKey,
        enabled: true,
        ready: true,
        layoutSource,
        scrollRef: { current: { scrollTo } },
        onContentMeasured,
      });
      const onHostContentSizeChange = useReadingContentMeasurement({
        enabled: true,
        ready: true,
        contentRef,
        beginMeasurement: progress.beginContentMeasurement,
        onContentSizeChange: progress.onContentSizeChange,
      });
      return { ...progress, onHostContentSizeChange };
    });
    expect(measurements).toHaveLength(1);

    await act(() => {
      host.result.current.onLayout(viewport);
      measurements[0](0, 0, 320, 3800, 0, 0);
      host.result.current.onHostContentSizeChange(320, 4200);
      measurements[1](0, 0, 320, 4200, 0, 0);
      host.result.current.onScroll(1600);
      jest.advanceTimersByTime(2000);
    });
    expect(onContentMeasured).toHaveBeenNthCalledWith(1, 320, 3800);
    expect(onContentMeasured).toHaveBeenLastCalledWith(320, 4200);
    expect(host.result.current.restoredOffset).toBeNull();
    await host.unmount();

    expect(saveProgress).not.toHaveBeenCalled();
    expect(removeProgress).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(useProgressStore.getState().progress[contentKey]).toEqual(
      savedEntry,
    );
    expectNoStorageAccess();
  });
});
