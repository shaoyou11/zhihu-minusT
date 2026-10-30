import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  createGestureController,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { ActionType } from 'react-native-gesture-handler/src/ActionType';
import { PointerType } from 'react-native-gesture-handler/src/PointerType';
import { State } from 'react-native-gesture-handler/src/State';
import WebPanGestureHandler from 'react-native-gesture-handler/src/web/handlers/PanGestureHandler';
import {
  type AdaptedEvent,
  EventTypes,
} from 'react-native-gesture-handler/src/web/interfaces';
import { PaneDivider } from '../src/features/adaptive-layout/PaneDivider';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    background: '#fff',
    backgroundSecondary: '#eee',
    textSecondary: '#666',
    primary: '#08f',
    onPrimary: '#fff',
    border: '#ccc',
  }),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  impactAsync: jest.fn(async () => undefined),
}));

function callbacks() {
  return {
    onChange: jest.fn<void, [number]>(),
    onCommit: jest.fn<void, [number]>(),
    onCancel: jest.fn<void, []>(),
  };
}

type DividerProps = React.ComponentProps<typeof PaneDivider>;

function divider(props: DividerProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaneDivider {...props} />
    </GestureHandlerRootView>
  );
}

function controller() {
  return createGestureController<{ translationX: number }>('pane-divider-pan');
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ enableHapticFeedback: true });
});

test('requires a long press and does not resize or vibrate for a short press or ordinary swipe', async () => {
  const actions = callbacks();
  await render(divider({ width: 1000, ratio: 1 / 3, ...actions }));
  expect(screen.getByTestId('pane-divider-line')).toBeVisible();
  expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
  const gesture = getByGestureTestId('pane-divider-pan');
  expect(gesture.config).toMatchObject({
    activateAfterLongPress: 300,
    minDist: Number.MAX_SAFE_INTEGER,
    maxPointers: 1,
    runOnJS: true,
  });
  const pan = controller();
  await act(() => pan.begin());
  expect(screen.getByTestId('pane-divider-indicator')).toBeVisible();
  expect(screen.queryByText(/调整栏宽/)).toBeNull();
  await act(() => pan.fail({ translationX: 0 }));
  expect(screen.getByTestId('pane-divider-line')).toBeVisible();
  expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
  await act(() => pan.begin());
  await act(() => pan.fail({ translationX: 80 }));
  expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
  expect(actions.onChange).not.toHaveBeenCalled();
  expect(actions.onCommit).not.toHaveBeenCalled();
  expect(actions.onCancel).not.toHaveBeenCalled();
  expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
});

// Exercise the library's real activation rules rather than manually calling the
// controller's activate(), which cannot catch distance bypassing the hold timer.
class TestWebPanGestureHandler extends WebPanGestureHandler {
  pointerDown(event: AdaptedEvent) {
    this.onPointerDown(event);
  }

  pointerMove(event: AdaptedEvent) {
    this.onPointerMove(event);
  }

  pointerUp(event: AdaptedEvent) {
    this.onPointerUp(event);
  }
}

function webPointer(eventType: EventTypes, x = 100): AdaptedEvent {
  return {
    eventType,
    x,
    y: 100,
    offsetX: x,
    offsetY: 100,
    pointerId: 1,
    pointerType: PointerType.MOUSE,
    time: Date.now(),
  };
}

test.each(['hold', 'swipe', 'release'] as const)(
  'the real web recognizer waits for its timer and handles %s before the hold finishes',
  async (ending) => {
    jest.useFakeTimers();
    let pan: TestWebPanGestureHandler | undefined;
    try {
      await render(divider({ width: 1000, ratio: 1 / 3, ...callbacks() }));
      const { config } = getByGestureTestId('pane-divider-pan');
      const onActivate = jest.fn();
      pan = new TestWebPanGestureHandler({
        view: null,
        init: jest.fn(),
        detach: jest.fn(),
        updateDOM: jest.fn(),
        isPointerInBounds: () => true,
        measureView: () => ({ pageX: 0, pageY: 0, width: 1000, height: 800 }),
        absoluteToLocal: (x, y) => ({ x, y }),
        reset: jest.fn(),
        onBegin: jest.fn(),
        onActivate,
        onEnd: jest.fn(),
        onCancel: jest.fn(),
        onFail: jest.fn(),
        onEnabledChange: jest.fn(),
        destroy: jest.fn(),
      });
      pan.handlerTag = 90001;
      pan.init(
        1,
        {
          current: {
            onGestureHandlerEvent: jest.fn(),
            onGestureHandlerStateChange: jest.fn(),
            onGestureHandlerTouchEvent: jest.fn(),
          },
        },
        ActionType.JS_FUNCTION_OLD_API,
      );
      pan.updateGestureConfig({
        enabled: true,
        activateAfterLongPress: config.activateAfterLongPress,
        minDist: config.minDist,
        maxPointers: config.maxPointers,
      });
      pan.pointerDown(webPointer(EventTypes.DOWN));
      expect(pan.state).toBe(State.BEGAN);
      pan.pointerMove(webPointer(EventTypes.MOVE, 101));
      expect(pan.state).toBe(State.BEGAN);
      await act(() => jest.advanceTimersByTime(299));
      expect(onActivate).not.toHaveBeenCalled();
      expect(pan.state).toBe(State.BEGAN);
      if (ending === 'swipe') pan.pointerMove(webPointer(EventTypes.MOVE, 180));
      if (ending === 'release') pan.pointerUp(webPointer(EventTypes.UP, 101));
      await act(() => jest.advanceTimersByTime(1));
      if (ending === 'hold') {
        expect(onActivate).toHaveBeenCalledTimes(1);
        expect(pan.state).toBe(State.ACTIVE);
        pan.pointerUp(webPointer(EventTypes.UP, 101));
      } else {
        expect(onActivate).not.toHaveBeenCalled();
        expect(pan.state).not.toBe(State.ACTIVE);
      }
    } finally {
      pan?.onDestroy();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  },
);

test('activates feedback, updates against the activation anchor and commits only once through finalization', async () => {
  const actions = callbacks();
  const host = await render(divider({ width: 1000, ratio: 0.3, ...actions }));
  const gesture = getByGestureTestId('pane-divider-pan');
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate({ translationX: 8 }));
  expect(
    screen.getByText('调整栏宽 30%', { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('light');
  await act(() => pan.update({ translationX: 108 }));
  const first = 0.3 + 100 / 984;
  expect(actions.onChange).toHaveBeenLastCalledWith(first);
  expect(
    screen.getByText('调整栏宽 40%', { includeHiddenElements: true }),
  ).toBeOnTheScreen();

  const latestActions = callbacks();
  await host.rerender(divider({ width: 1000, ratio: first, ...latestActions }));
  expect(getByGestureTestId('pane-divider-pan')).toBe(gesture);
  await act(() => pan.update({ translationX: 208 }));
  const last = 0.3 + 200 / 984;
  expect(latestActions.onChange).toHaveBeenLastCalledWith(last);
  await act(() => pan.end({ translationX: 208 }));
  expect(latestActions.onCommit).toHaveBeenCalledTimes(1);
  expect(latestActions.onCommit).toHaveBeenCalledWith(last);
  expect(actions.onCommit).not.toHaveBeenCalled();
  expect(latestActions.onCancel).not.toHaveBeenCalled();
  expect(screen.queryByText(/调整栏宽/)).toBeNull();
  expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
});

test.each(['cancel', 'fail'] as const)(
  'rolls back an active gesture once after %s and clears feedback',
  async (ending) => {
    const actions = callbacks();
    await render(divider({ width: 390, ratio: 1 / 3, ...actions }));
    const pan = controller();
    await act(() => pan.begin());
    await act(() => pan.activate());
    await act(() => pan.update({ translationX: 40 }));
    await act(() => pan[ending]());
    expect(actions.onCancel).toHaveBeenCalledTimes(1);
    expect(actions.onCommit).not.toHaveBeenCalled();
    expect(screen.queryByText(/调整栏宽/)).toBeNull();
    expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
  },
);

test('resizing aborts the drag without committing or accepting subsequent updates', async () => {
  const actions = callbacks();
  const host = await render(divider({ width: 390, ratio: 1 / 3, ...actions }));
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate());
  await act(() => pan.update({ translationX: 40 }));
  actions.onChange.mockClear();
  await host.rerender(divider({ width: 844, ratio: 1 / 3, ...actions }));
  expect(actions.onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/调整栏宽/)).toBeNull();
  await act(() => pan.update({ translationX: 80 }));
  await act(() => pan.end({ translationX: 80 }));
  expect(actions.onChange).not.toHaveBeenCalled();
  expect(actions.onCommit).not.toHaveBeenCalled();
  expect(actions.onCancel).toHaveBeenCalledTimes(1);
});

test('unmounting an active drag restores the saved ratio without committing', async () => {
  const actions = callbacks();
  const host = await render(divider({ width: 390, ratio: 1 / 3, ...actions }));
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate());
  await act(() => pan.update({ translationX: 40 }));
  await host.unmount();
  expect(actions.onCancel).toHaveBeenCalledTimes(1);
  expect(actions.onCommit).not.toHaveBeenCalled();
});

test('clamps drag movement to supported ratios', async () => {
  const actions = callbacks();
  await render(divider({ width: 390, ratio: 1 / 3, ...actions }));
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate());
  await act(() => pan.update({ translationX: 10000 }));
  expect(actions.onChange).toHaveBeenLastCalledWith(0.6);
  await act(() => pan.update({ translationX: -10000 }));
  expect(actions.onChange).toHaveBeenLastCalledWith(0.2);
  await act(() => pan.end({ translationX: -10000 }));
  expect(actions.onCommit).toHaveBeenCalledTimes(1);
  expect(actions.onCommit).toHaveBeenCalledWith(0.2);
});

test('includes the final release movement in its single commit', async () => {
  const actions = callbacks();
  await render(divider({ width: 1000, ratio: 0.3, ...actions }));
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate({ translationX: 4 }));
  await act(() => pan.update({ translationX: 54 }));
  await act(() => pan.end({ translationX: 104 }));
  const finalRatio = 0.3 + 100 / 984;
  expect(actions.onChange).toHaveBeenLastCalledWith(finalRatio);
  expect(actions.onCommit).toHaveBeenCalledTimes(1);
  expect(actions.onCommit).toHaveBeenCalledWith(finalRatio);
  expect(screen.queryByTestId('pane-divider-indicator')).toBeNull();
});

test.each([0, 16])(
  'ignores dragging when width %s cannot hold a divider',
  async (width) => {
    const actions = callbacks();
    await render(divider({ width, ratio: 1 / 3, ...actions }));
    const pan = controller();
    await act(() => pan.begin());
    await act(() => pan.activate());
    await act(() => pan.update({ translationX: 40 }));
    await act(() => pan.end());
    expect(actions.onChange).not.toHaveBeenCalled();
    expect(actions.onCommit).not.toHaveBeenCalled();
    expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
  },
);

test('accessibility can adjust and commit immediately without a long press', async () => {
  const actions = callbacks();
  const host = await render(divider({ width: 390, ratio: 0.3, ...actions }));
  await fireEvent(
    screen.getByTestId('adaptive-divider'),
    'accessibilityAction',
    {
      nativeEvent: { actionName: 'increment' },
    },
  );
  expect(actions.onChange).toHaveBeenCalledTimes(1);
  expect(actions.onChange).toHaveBeenCalledWith(0.35);
  expect(actions.onCommit).toHaveBeenCalledTimes(1);
  expect(actions.onCommit).toHaveBeenCalledWith(0.35);
  await host.rerender(divider({ width: 390, ratio: 0.2, ...actions }));
  await fireEvent(
    screen.getByTestId('adaptive-divider'),
    'accessibilityAction',
    {
      nativeEvent: { actionName: 'decrement' },
    },
  );
  expect(actions.onCommit).toHaveBeenLastCalledWith(0.2);
  expect(actions.onCancel).not.toHaveBeenCalled();
  expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
});

test('activation respects the global haptic preference', async () => {
  useSettingsStore.setState({ enableHapticFeedback: false });
  await render(divider({ width: 390, ratio: 1 / 3, ...callbacks() }));
  const pan = controller();
  await act(() => pan.begin());
  await act(() => pan.activate());
  expect(
    screen.getByText('调整栏宽 33%', { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
  await act(() => pan.end());
});
