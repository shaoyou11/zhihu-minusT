import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRuntimeThemeColors } from '@/components/Themed';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { getListPaneWidth, PANE_DIVIDER_WIDTH } from './layout';

type PaneDividerProps = {
  width: number;
  ratio: number;
  onChange: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
};

type DragSession = {
  phase: 'idle' | 'pressing' | 'active';
  width: number;
  ratio: number;
  translationX: number;
  nextRatio: number;
};

function normalizeRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(0.6, Math.max(0.2, ratio)) : 1 / 3;
}

function getDragRatio(session: DragSession, translationX: number): number {
  return normalizeRatio(
    session.ratio +
      (translationX - session.translationX) /
        (session.width - PANE_DIVIDER_WIDTH),
  );
}

export function PaneDivider(props: PaneDividerProps) {
  const colors = useRuntimeThemeColors();
  const latest = useRef(props);
  latest.current = props;
  const drag = useRef<DragSession>({
    phase: 'idle',
    width: props.width,
    ratio: normalizeRatio(props.ratio),
    translationX: 0,
    nextRatio: normalizeRatio(props.ratio),
  });
  const [feedback, setFeedback] = useState<DragSession['phase']>('idle');
  const [displayRatio, setDisplayRatio] = useState(normalizeRatio(props.ratio));

  const gesture = useMemo(() => {
    const cancel = () => {
      const active = drag.current.phase === 'active';
      drag.current.phase = 'idle';
      setFeedback('idle');
      if (active) latest.current.onCancel();
    };
    return (
      Gesture.Pan()
        .withTestId('pane-divider-pan')
        .activateAfterLongPress(300)
        // Distance activation is independent of the long-press timer on Android
        // and Web. Only the timer may activate this gesture, including on jitter.
        .minDistance(Number.MAX_SAFE_INTEGER)
        .maxPointers(1)
        .runOnJS(true)
        .onBegin(() => {
          drag.current.phase = 'pressing';
          drag.current.width = latest.current.width;
          setFeedback('pressing');
        })
        .onStart((event) => {
          const { width, ratio } = latest.current;
          if (
            drag.current.phase !== 'pressing' ||
            !Number.isFinite(width) ||
            width <= PANE_DIVIDER_WIDTH
          )
            return;
          const normalized = normalizeRatio(ratio);
          drag.current = {
            phase: 'active',
            width,
            ratio: normalized,
            translationX: event.translationX,
            nextRatio: normalized,
          };
          setDisplayRatio(normalized);
          setFeedback('active');
          void impactAsync(ImpactFeedbackStyle.Light).catch(() => undefined);
        })
        .onUpdate((event) => {
          const session = drag.current;
          if (session.phase !== 'active') return;
          if (latest.current.width !== session.width) {
            cancel();
            return;
          }
          const next = getDragRatio(session, event.translationX);
          session.nextRatio = next;
          setDisplayRatio(next);
          latest.current.onChange(next);
        })
        .onEnd((event, success) => {
          const session = drag.current;
          if (session.phase !== 'active') return;
          if (!success || latest.current.width !== session.width) {
            cancel();
            return;
          }
          const next = getDragRatio(session, event.translationX);
          session.phase = 'idle';
          setFeedback('idle');
          if (next !== session.nextRatio) latest.current.onChange(next);
          latest.current.onCommit(next);
        })
        .onFinalize(() => cancel())
    );
  }, []);

  useLayoutEffect(() => {
    if (drag.current.phase === 'idle' || drag.current.width === props.width)
      return;
    const active = drag.current.phase === 'active';
    drag.current.phase = 'idle';
    setFeedback('idle');
    if (active) latest.current.onCancel();
  }, [props.width]);

  useEffect(
    () => () => {
      const active = drag.current.phase === 'active';
      drag.current.phase = 'idle';
      if (active) latest.current.onCancel();
    },
    [],
  );

  const active = feedback === 'active';
  const currentRatio = active ? displayRatio : normalizeRatio(props.ratio);
  return (
    <GestureDetector gesture={gesture}>
      <View
        testID="adaptive-divider"
        collapsable={false}
        hitSlop={{ left: 4, right: 4 }}
        accessibilityRole="adjustable"
        accessibilityLabel="调整列表宽度"
        accessibilityHint="长按后左右拖动，或使用增减操作调整列表宽度"
        accessibilityValue={{
          min: 20,
          max: 60,
          now: Math.round(currentRatio * 100),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent: { actionName } }) => {
          if (
            (actionName !== 'increment' && actionName !== 'decrement') ||
            !Number.isFinite(props.width) ||
            props.width <= PANE_DIVIDER_WIDTH
          )
            return;
          const wasActive = drag.current.phase === 'active';
          drag.current.phase = 'idle';
          setFeedback('idle');
          if (wasActive) latest.current.onCancel();
          const next = normalizeRatio(
            latest.current.ratio + (actionName === 'increment' ? 0.05 : -0.05),
          );
          latest.current.onChange(next);
          latest.current.onCommit(next);
        }}
        style={[
          styles.divider,
          {
            left: getListPaneWidth(props.width, props.ratio),
          },
        ]}
      >
        <View
          testID="pane-divider-line"
          pointerEvents="none"
          style={[
            styles.line,
            {
              width: active ? 3 : 1,
              backgroundColor: active ? colors.primary : colors.border,
            },
          ]}
        />
        {feedback !== 'idle' ? (
          <View
            testID="pane-divider-indicator"
            pointerEvents="none"
            style={styles.indicator}
          >
            <View
              style={[
                styles.grip,
                {
                  opacity: feedback === 'pressing' ? 0.65 : 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active
                    ? colors.primary
                    : colors.backgroundSecondary,
                },
              ]}
            >
              <View
                style={[
                  styles.gripMark,
                  {
                    backgroundColor: active
                      ? colors.onPrimary
                      : colors.textSecondary,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}
        {active ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.feedback, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.onPrimary }}>
              调整栏宽 {Math.round(displayRatio * 100)}%
            </Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PANE_DIVIDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { position: 'absolute', top: 0, bottom: 0 },
  grip: {
    width: 12,
    height: 48,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gripMark: { width: 2, height: 20, borderRadius: 1 },
  feedback: {
    position: 'absolute',
    left: PANE_DIVIDER_WIDTH + 8,
    top: '50%',
    marginTop: -18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 112,
  },
});
