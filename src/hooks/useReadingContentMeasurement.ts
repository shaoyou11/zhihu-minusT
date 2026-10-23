import { useCallback, useLayoutEffect } from 'react';
import type { MeasureOnSuccessCallback } from 'react-native';
import type { CompleteReadingContentMeasurement } from './useReadingProgress';

interface MeasurableContent {
  measure: (callback: MeasureOnSuccessCallback) => void;
}

interface ReadingContentMeasurementOptions {
  enabled: boolean;
  ready: boolean;
  contentRef: React.RefObject<MeasurableContent | null>;
  beginMeasurement: () => CompleteReadingContentMeasurement | null;
  onContentSizeChange: (width: number, height: number) => void;
}

/** Measure the ScrollView's inner content after the ready/body commit. */
export function useReadingContentMeasurement({
  enabled,
  ready,
  contentRef,
  beginMeasurement,
  onContentSizeChange,
}: ReadingContentMeasurementOptions) {
  const measureContent = useCallback(() => {
    if (!enabled || !ready || !contentRef.current) return;
    const complete = beginMeasurement();
    if (!complete) return;
    contentRef.current.measure((_x, _y, width, height) => {
      complete(width, height);
    });
  }, [enabled, ready, contentRef, beginMeasurement]);

  // Same-height replacement need not emit onContentSizeChange; readiness itself
  // requests a source-paired measurement of the newly committed content.
  useLayoutEffect(() => {
    measureContent();
  }, [measureContent]);

  return useCallback(
    (width: number, height: number) => {
      onContentSizeChange(width, height);
      measureContent();
    },
    [onContentSizeChange, measureContent],
  );
}
