import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ZhihuPreviewLoginPrompt,
  ZhihuReadingPreviewItem,
} from '@/api/zhihu/nextRender';

type FooterView = Pick<ViewInstance, 'measureInWindow'>;
type PreviewAnswer = Exclude<ZhihuReadingPreviewItem, ZhihuPreviewLoginPrompt>;

interface FloatingBarOptions {
  scope: string;
  items: readonly ZhihuReadingPreviewItem[];
  expandedIds: ReadonlySet<string>;
  navigationHeight: number;
}

interface ViewableItems {
  viewableItems: Array<{
    item: ZhihuReadingPreviewItem;
    isViewable?: boolean;
  }>;
}

/** Reveal answer actions only while its expanded body hides every visible footer. */
export function useAnswerPreviewFloatingBar({
  scope,
  items,
  expandedIds,
  navigationHeight,
}: FloatingBarOptions) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const epoch = useMemo(
    () => ({
      scope,
      activeId: null as string | null,
      viewableIds: [] as string[],
      footers: new Map<string, FooterView>(),
      scrollY: 0,
      sequence: 0,
      lastCheck: 0,
    }),
    [scope],
  );
  const inputs = useMemo(
    () => ({
      items,
      expandedIds,
      top: navigationHeight,
      bottom: height - insets.bottom,
    }),
    [items, expandedIds, navigationHeight, height, insets.bottom],
  );
  const currentEpoch = useRef(epoch);
  const currentInputs = useRef(inputs);
  currentEpoch.current = epoch;
  currentInputs.current = inputs;
  const mounted = useRef(true);
  const [active, setActive] = useState({ epoch, id: null as string | null });
  const [visibility, setVisibility] = useState({ epoch, visible: false });
  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 20 }),
    [],
  );

  const setVisible = useCallback(
    (visible: boolean) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      setVisibility((previous) =>
        previous.epoch === epoch && previous.visible === visible
          ? previous
          : { epoch, visible },
      );
    },
    [epoch],
  );

  const measureFooters = useCallback(
    (force = false) => {
      if (
        !mounted.current ||
        currentEpoch.current !== epoch ||
        currentInputs.current !== inputs
      )
        return;
      const snapshot = inputs;
      const activeAnswer = snapshot.items.find(
        (item): item is PreviewAnswer =>
          item.type === 'answer' && item.id === epoch.activeId,
      );
      const views = epoch.viewableIds.map((id) => ({
        id,
        view: epoch.footers.get(id),
      }));
      if (
        epoch.scrollY <= 300 ||
        !activeAnswer ||
        !snapshot.expandedIds.has(activeAnswer.id) ||
        !views.length ||
        views.some(({ view }) => !view) ||
        snapshot.bottom <= snapshot.top
      ) {
        epoch.sequence += 1;
        setVisible(false);
        return;
      }

      const now = Date.now();
      if (!force && now - epoch.lastCheck < 100) return;
      epoch.lastCheck = now;
      const sequence = ++epoch.sequence;

      let remaining = views.length;
      let anyVisible = false;
      let invalid = false;
      for (const { id, view } of views) {
        if (!view) continue;
        view.measureInWindow((_x, y, width, footerHeight) => {
          if (
            !mounted.current ||
            currentEpoch.current !== epoch ||
            currentInputs.current !== snapshot ||
            epoch.sequence !== sequence ||
            epoch.footers.get(id) !== view
          )
            return;
          if (
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(footerHeight) ||
            width <= 0 ||
            footerHeight <= 0
          ) {
            invalid = true;
          } else if (y + footerHeight > snapshot.top && y < snapshot.bottom) {
            anyVisible = true;
          }
          remaining -= 1;
          if (remaining === 0) setVisible(!invalid && !anyVisible);
        });
      }
    },
    [epoch, inputs, setVisible],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: ViewableItems) => {
      if (currentEpoch.current !== epoch) return;
      const answers = viewableItems
        .filter((entry) => entry.isViewable !== false)
        .map((entry) => entry.item)
        .filter((item): item is PreviewAnswer => item.type === 'answer');
      epoch.viewableIds = [...new Set(answers.map((answer) => answer.id))];
      epoch.activeId = answers[0]?.id ?? null;
      setActive((previous) =>
        previous.epoch === epoch && previous.id === epoch.activeId
          ? previous
          : { epoch, id: epoch.activeId },
      );
      setVisible(false);
      measureFooters(true);
    },
    [epoch, measureFooters, setVisible],
  );

  const updateScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>, force: boolean) => {
      if (currentEpoch.current !== epoch) return;
      const y = event.nativeEvent.contentOffset.y;
      epoch.scrollY = Number.isFinite(y) ? Math.max(0, y) : 0;
      epoch.sequence += 1;
      measureFooters(force || epoch.scrollY <= 300);
    },
    [epoch, measureFooters],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      updateScroll(event, false),
    [updateScroll],
  );
  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      updateScroll(event, true),
    [updateScroll],
  );

  const registerFooter = useCallback(
    (id: string, view: FooterView | null) => {
      if (currentEpoch.current !== epoch) return;
      if (view) epoch.footers.set(id, view);
      else epoch.footers.delete(id);
      setVisible(false);
      measureFooters(true);
    },
    [epoch, measureFooters, setVisible],
  );

  const onFooterLayout = useCallback(
    () => measureFooters(true),
    [measureFooters],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.sequence += 1;
    };
  }, [epoch]);

  useEffect(() => {
    measureFooters(true);
  }, [measureFooters]);

  const activeAnswer =
    active.epoch === epoch
      ? (items.find(
          (item): item is PreviewAnswer =>
            item.type === 'answer' && item.id === active.id,
        ) ?? null)
      : null;
  const visible = Boolean(
    visibility.epoch === epoch &&
      visibility.visible &&
      activeAnswer &&
      expandedIds.has(activeAnswer.id),
  );

  return {
    activeAnswer,
    visible,
    onViewableItemsChanged,
    viewabilityConfig,
    onScroll,
    onScrollEnd,
    registerFooter,
    onFooterLayout,
  };
}
