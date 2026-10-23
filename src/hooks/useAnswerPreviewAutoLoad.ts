import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FooterView = Pick<ViewInstance, 'measureInWindow'>;
type BodyLoader = () => Promise<unknown>;

interface AutoLoadOptions {
  scope: string;
  expandedIds: ReadonlySet<string>;
  navigationHeight: number;
}

interface ViewableItems {
  viewableItems: Array<{
    item: { id: string; type: string };
    isViewable?: boolean;
  }>;
}

/** Continue only visible expanded bodies whose loaded footer is near the viewport. */
export function useAnswerPreviewAutoLoad({
  scope,
  expandedIds,
  navigationHeight,
}: AutoLoadOptions) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const epoch = useMemo(
    () => ({
      scope,
      footers: new Map<string, FooterView>(),
      loaders: new Map<string, BodyLoader>(),
      viewableIds: [] as string[],
      sequence: 0,
      frame: null as number | null,
      lastScrollCheck: Number.NEGATIVE_INFINITY,
      needsCheck: false,
    }),
    [scope],
  );
  const inputs = useMemo(
    () => ({
      expandedIds,
      top: navigationHeight,
      bottom: height - insets.bottom,
    }),
    [expandedIds, navigationHeight, height, insets.bottom],
  );
  const currentEpoch = useRef(epoch);
  const currentInputs = useRef(inputs);
  currentEpoch.current = epoch;
  currentInputs.current = inputs;
  const mounted = useRef(true);
  // Keep one slot across scope changes until its real request has settled.
  const pending = useRef<object | null>(null);
  const scheduleLatest = useRef<() => void>(() => {});

  const scheduleMeasure = useCallback(() => {
    if (!mounted.current || currentEpoch.current !== epoch) return;
    epoch.sequence += 1;
    if (epoch.frame !== null) return;
    epoch.frame = requestAnimationFrame(() => {
      epoch.frame = null;
      if (!mounted.current || currentEpoch.current !== epoch) return;
      const snapshot = currentInputs.current;
      const views = epoch.viewableIds.flatMap((id) => {
        const view = epoch.footers.get(id);
        const loader = epoch.loaders.get(id);
        return snapshot.expandedIds.has(id) && view && loader
          ? [{ id, view, loader }]
          : [];
      });
      if (pending.current) {
        epoch.needsCheck = views.length > 0;
        return;
      }
      epoch.needsCheck = false;
      if (
        !Number.isFinite(snapshot.top) ||
        !Number.isFinite(snapshot.bottom) ||
        snapshot.bottom <= snapshot.top
      )
        return;
      const sequence = epoch.sequence;
      const preloadBottom =
        snapshot.bottom + (snapshot.bottom - snapshot.top) / 2;
      for (const { id, view, loader } of views) {
        view.measureInWindow((_x, y, width, footerHeight) => {
          if (
            !mounted.current ||
            currentEpoch.current !== epoch ||
            currentInputs.current !== snapshot ||
            epoch.sequence !== sequence ||
            epoch.footers.get(id) !== view ||
            epoch.loaders.get(id) !== loader ||
            pending.current ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(footerHeight) ||
            width <= 0 ||
            footerHeight <= 0 ||
            y + footerHeight <= snapshot.top ||
            y > preloadBottom
          )
            return;
          // Other callbacks from this geometry batch must not start another page.
          epoch.sequence += 1;
          const request = {};
          pending.current = request;
          const settle = () => {
            if (pending.current !== request) return;
            pending.current = null;
            // A new layout/loader/scroll requires fresh geometry in another frame.
            if (mounted.current && currentEpoch.current.needsCheck)
              scheduleLatest.current();
          };
          try {
            void loader().then(settle, settle);
          } catch {
            settle();
          }
        });
      }
    });
  }, [epoch]);
  scheduleLatest.current = scheduleMeasure;

  const registerFooter = useCallback(
    (id: string, view: FooterView | null) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      if (view) epoch.footers.set(id, view);
      else epoch.footers.delete(id);
      scheduleMeasure();
    },
    [epoch, scheduleMeasure],
  );
  const registerLoader = useCallback(
    (id: string, loader: BodyLoader | null) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      if (loader) epoch.loaders.set(id, loader);
      else epoch.loaders.delete(id);
      scheduleMeasure();
    },
    [epoch, scheduleMeasure],
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: ViewableItems) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      epoch.viewableIds = [
        ...new Set(
          viewableItems
            .filter(
              ({ item, isViewable }) =>
                isViewable !== false && item.type === 'answer',
            )
            .map(({ item }) => item.id),
        ),
      ];
      scheduleMeasure();
    },
    [epoch, scheduleMeasure],
  );
  const onScroll = useCallback(
    (_event?: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      epoch.sequence += 1;
      const now = Date.now();
      if (now - epoch.lastScrollCheck < 150) return;
      epoch.lastScrollCheck = now;
      scheduleMeasure();
    },
    [epoch, scheduleMeasure],
  );
  const onScrollEnd = useCallback(
    (_event?: NativeSyntheticEvent<NativeScrollEvent>) => scheduleMeasure(),
    [scheduleMeasure],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.sequence += 1;
      if (epoch.frame !== null) cancelAnimationFrame(epoch.frame);
      epoch.frame = null;
    };
  }, [epoch]);
  useEffect(() => {
    if (currentInputs.current === inputs) scheduleMeasure();
  }, [inputs, scheduleMeasure]);

  return {
    registerFooter,
    registerLoader,
    onViewableItemsChanged,
    onScroll,
    onScrollEnd,
    onFooterLayout: scheduleMeasure,
  };
}
