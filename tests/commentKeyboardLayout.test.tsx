import { act, renderHook } from '@testing-library/react-native';
import {
  Keyboard,
  type KeyboardEvent,
  type KeyboardEventName,
  Platform,
  type ViewInstance,
} from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { useCommentKeyboardLayout } from '../src/hooks/useCommentKeyboardLayout';

interface InputBarStyle {
  bottom: number;
  paddingBottom: number;
}

const mockAnimatedStyles = new WeakMap<object, InputBarStyle>();

jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: <Value,>(value: Value) => react.useRef({ value }).current,
    useAnimatedStyle: (compute: () => Record<string, number>) => {
      const handle = {};
      const style = new Proxy(
        { bottom: 0, paddingBottom: 0 },
        { get: (_target, key: string) => compute()[key] },
      );
      mockAnimatedStyles.set(handle, style);
      return handle;
    },
    withTiming: jest.fn((value: number) => value),
  };
});

// Reanimated exposes an opaque handle. Inspect only this mock's live style,
// including after unmount, without assuming the production handle's shape.
function readMockAnimatedStyle(handle: object): InputBarStyle {
  const style = mockAnimatedStyles.get(handle);
  if (!style) throw new Error('Expected a mocked animated style handle');
  return style;
}

type MeasureCallback = Parameters<ViewInstance['measure']>[0];
type WindowMeasureCallback = Parameters<ViewInstance['measureInWindow']>[0];
type KeyboardListener = (event: KeyboardEvent) => void;

const originalPlatform = Platform.OS;
const listeners = new Map<KeyboardEventName, Set<KeyboardListener>>();

function keyboardEvent(
  screenY: number,
  height: number,
  duration = 250,
): KeyboardEvent {
  return {
    duration,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 400, height },
  } as KeyboardEvent;
}

async function emit(name: KeyboardEventName, event: KeyboardEvent) {
  await act(() => {
    for (const listener of listeners.get(name) ?? []) listener(event);
  });
}

async function mountLayout(bottomInset = 24, platform = 'android') {
  Object.defineProperty(Platform, 'OS', {
    value: platform,
    configurable: true,
  });
  const host = await renderHook(useCommentKeyboardLayout, {
    initialProps: bottomInset,
  });
  const measures: MeasureCallback[] = [];
  const windowMeasures: WindowMeasureCallback[] = [];
  const measure = jest.fn((callback: MeasureCallback) =>
    measures.push(callback),
  );
  const measureInWindow = jest.fn((callback: WindowMeasureCallback) =>
    windowMeasures.push(callback),
  );
  host.result.current.containerRef.current = {
    measure,
    measureInWindow,
  } as unknown as ViewInstance;

  return { ...host, measures, windowMeasures, measure, measureInWindow };
}

async function measureAndroid(callback: MeasureCallback, bottom: number) {
  // Android measure's pageY is the root coordinate, even with a status bar.
  await act(() => callback(0, 0, 400, bottom - 80, 0, 80));
}

beforeEach(() => {
  listeners.clear();
  jest.mocked(withTiming).mockClear();
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    const registered = listeners.get(name) ?? new Set<KeyboardListener>();
    registered.add(listener);
    listeners.set(name, registered);
    return {
      remove: () => {
        registered.delete(listener);
      },
    } as ReturnType<typeof Keyboard.addListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', {
    value: originalPlatform,
    configurable: true,
  });
});

test.each([0, 24, 48])(
  'keeps the Android input 12 points above the keyboard with a %i point navigation bar',
  async (navigationBarHeight) => {
    const host = await mountLayout(navigationBarHeight);
    // Android keyboard height omits the navigation bar, while screenY does not.
    await emit(
      'keyboardDidShow',
      keyboardEvent(500, 300 - navigationBarHeight),
    );
    const pending = host.measures.at(-1);
    expect(pending).toBeDefined();
    await measureAndroid(pending as MeasureCallback, 800);
    const style = readMockAnimatedStyle(
      host.result.current.inputBarAnimatedStyle,
    );
    expect(style.bottom).toBe(300);
    expect(style.paddingBottom).toBe(12);
    expect(800 - Number(style.bottom) - Number(style.paddingBottom)).toBe(488);
    expect(host.measureInWindow).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
    await host.unmount();
  },
);

test('does not lift an Android root that has already resized above the keyboard', async () => {
  const host = await mountLayout(48);
  await emit('keyboardDidShow', keyboardEvent(500, 252));
  const pending = host.measures.at(-1);
  expect(pending).toBeDefined();
  await measureAndroid(pending as MeasureCallback, 500);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(12);
  expect(withTiming).not.toHaveBeenCalled();
  await host.unmount();
});

test('recalculates the Android overlap when layout changes before and after resize', async () => {
  const host = await mountLayout();
  await emit('keyboardDidShow', keyboardEvent(500, 276));
  const initialMeasure = host.measures.at(-1);
  expect(initialMeasure).toBeDefined();
  await measureAndroid(initialMeasure as MeasureCallback, 800);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(300);

  await act(() => host.result.current.onContainerLayout());
  const beforeResize = host.measures.at(-1);
  expect(beforeResize).not.toBe(initialMeasure);
  await measureAndroid(beforeResize as MeasureCallback, 800);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(300);

  await act(() => host.result.current.onContainerLayout());
  const afterResize = host.measures.at(-1);
  expect(afterResize).not.toBe(beforeResize);
  await measureAndroid(afterResize as MeasureCallback, 500);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(12);
  await host.unmount();
});

test.each([0, 24, 48])(
  'restores the %i point safe area after hide and rejects pending measurements',
  async (bottomInset) => {
    const host = await mountLayout(bottomInset);
    expect(
      readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
    ).toBe(0);
    expect(
      readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
        .paddingBottom,
    ).toBe(bottomInset || 12);
    await emit('keyboardDidShow', keyboardEvent(500, 276));
    const pending = host.measures.at(-1);
    expect(pending).toBeDefined();
    await emit('keyboardDidHide', keyboardEvent(800, 0));
    await measureAndroid(pending as MeasureCallback, 800);
    expect(
      readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
    ).toBe(0);
    expect(
      readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
        .paddingBottom,
    ).toBe(bottomInset || 12);
    expect(withTiming).not.toHaveBeenCalled();
    await host.unmount();
  },
);

test('rejects an old Android keyboard frame after a newer frame arrives', async () => {
  const host = await mountLayout();
  await emit('keyboardDidShow', keyboardEvent(500, 276));
  const oldMeasure = host.measures.at(-1);
  await emit('keyboardDidShow', keyboardEvent(450, 326));
  const newMeasure = host.measures.at(-1);
  expect(oldMeasure).toBeDefined();
  expect(newMeasure).not.toBe(oldMeasure);
  await measureAndroid(newMeasure as MeasureCallback, 800);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(350);
  await measureAndroid(oldMeasure as MeasureCallback, 800);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(350);
  await host.unmount();
});

test('rejects a pending Android measurement after layout starts a new measurement', async () => {
  const host = await mountLayout();
  await emit('keyboardDidShow', keyboardEvent(500, 276));
  const oldMeasure = host.measures.at(-1);
  await act(() => host.result.current.onContainerLayout());
  const newMeasure = host.measures.at(-1);
  expect(oldMeasure).toBeDefined();
  expect(newMeasure).not.toBe(oldMeasure);
  await measureAndroid(newMeasure as MeasureCallback, 500);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  await measureAndroid(oldMeasure as MeasureCallback, 800);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(12);
  await host.unmount();
});

test('removes keyboard listeners and rejects measurements after unmount', async () => {
  const host = await mountLayout();
  await emit('keyboardDidShow', keyboardEvent(500, 276));
  const pending = host.measures.at(-1);
  const style = readMockAnimatedStyle(
    host.result.current.inputBarAnimatedStyle,
  );
  expect(pending).toBeDefined();
  const bottomBeforeUnmount = style.bottom;
  await host.unmount();
  expect(
    [...listeners.values()].every((registered) => registered.size === 0),
  ).toBe(true);
  await measureAndroid(pending as MeasureCallback, 800);
  expect(style.bottom).toBe(bottomBeforeUnmount);
});

test('uses the iOS window position and keyboard animation duration', async () => {
  const host = await mountLayout(34, 'ios');
  await emit('keyboardWillChangeFrame', keyboardEvent(500, 300, 320));
  expect(host.windowMeasures).toHaveLength(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(34);

  await emit('keyboardWillShow', keyboardEvent(550, 250, 240));
  const showMeasure = host.windowMeasures.at(-1);
  expect(showMeasure).toBeDefined();
  await act(() => (showMeasure as WindowMeasureCallback)(0, 80, 400, 700));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(230);
  expect(withTiming).toHaveBeenCalledWith(230, { duration: 240 });

  await emit('keyboardWillChangeFrame', keyboardEvent(500, 300, 320));
  const pending = host.windowMeasures.at(-1);
  expect(pending).toBeDefined();
  await act(() => (pending as WindowMeasureCallback)(0, 80, 400, 700));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(280);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(12);
  expect(host.measure).not.toHaveBeenCalled();
  expect(withTiming).toHaveBeenCalledWith(280, { duration: 320 });
  await act(() => (showMeasure as WindowMeasureCallback)(0, 80, 400, 700));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(280);

  await emit('keyboardWillHide', keyboardEvent(800, 0, 180));
  await act(() => (pending as WindowMeasureCallback)(0, 80, 400, 700));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(34);
  expect(withTiming).toHaveBeenCalledWith(0, { duration: 180 });
  await host.unmount();
});

test('remeasures the iOS comment sheet when keyboard and detents resize its container', async () => {
  const host = await mountLayout(34, 'ios');
  await emit('keyboardWillShow', keyboardEvent(500, 300));
  const initial = host.windowMeasures.at(-1) as WindowMeasureCallback;
  await act(() => initial(0, 300, 400, 500));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(300);
  // UIKit can resize the sheet to end above the keyboard; do not lift twice.
  await act(() => host.result.current.onContainerLayout());
  const resized = host.windowMeasures.at(-1) as WindowMeasureCallback;
  await act(() => resized(0, 180, 400, 320));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  // Dragging to the larger detent must use the new window frame.
  await act(() => host.result.current.onContainerLayout());
  const expanded = host.windowMeasures.at(-1) as WindowMeasureCallback;
  await act(() => expanded(0, 100, 400, 620));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(220);
  await emit('keyboardWillHide', keyboardEvent(800, 0));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(34);
  await host.unmount();
});

test('uses native keyboard overlap in iOS sheets without JS coordinate estimates', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  const host = await renderHook(() => useCommentKeyboardLayout(34, true));
  const measureInWindow = jest.fn();
  host.result.current.containerRef.current = {
    measureInWindow,
  } as unknown as ViewInstance;
  await emit('keyboardWillShow', keyboardEvent(500, 300));
  await act(() => host.result.current.onContainerLayout());
  expect(measureInWindow).not.toHaveBeenCalled();
  const nativeOverlap = (height: number) =>
    ({ nativeEvent: { height } }) as Parameters<
      typeof host.result.current.onNativeOverlapChange
    >[0];
  await act(() =>
    host.result.current.onNativeOverlapChange(nativeOverlap(300)),
  );
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(300);
  await emit('keyboardWillChangeFrame', keyboardEvent(450, 350));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(300);
  await act(() =>
    host.result.current.onNativeOverlapChange(nativeOverlap(350)),
  );
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(350);
  await act(() =>
    host.result.current.onNativeOverlapChange(nativeOverlap(Number.NaN)),
  );
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(350);
  await act(() => host.result.current.onNativeOverlapChange(nativeOverlap(0)));
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle).bottom,
  ).toBe(0);
  expect(
    readMockAnimatedStyle(host.result.current.inputBarAnimatedStyle)
      .paddingBottom,
  ).toBe(34);
  expect(withTiming).not.toHaveBeenCalled();
  await host.unmount();
});
