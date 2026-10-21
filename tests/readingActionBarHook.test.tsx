import { act, renderHook } from '@testing-library/react-native';
import type { NativeScrollEvent } from 'react-native';
import { useReadingActionBar } from '../hooks/useReadingActionBar';

jest.mock('../components/ContentActionBar', () => ({
  CONTENT_ACTION_BAR_HEIGHT: 48,
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useDerivedValue: (compute: () => number) => ({
      get value() {
        return compute();
      },
    }),
    withTiming: (value: number) => value,
  };
});
const scroll = (y: number) =>
  ({
    contentOffset: { x: 0, y },
    contentSize: { width: 400, height: 2000 },
    layoutMeasurement: { width: 400, height: 800 },
  }) as NativeScrollEvent;

test('collapses while reading and tapping expand remains expanded during old momentum', async () => {
  const host = await renderHook(() => useReadingActionBar('article', 34));
  await act(() => {
    host.result.current.beginDrag(scroll(0));
    host.result.current.onScroll(scroll(180));
  });
  expect(host.result.current.collapseProgress.value).toBe(1);
  await act(() => host.result.current.expand());
  expect(host.result.current.collapseProgress.value).toBe(0);
  await act(() => host.result.current.onScroll(scroll(220)));
  expect(host.result.current.collapseProgress.value).toBe(0);
  await act(() => {
    host.result.current.beginDrag(scroll(220));
    host.result.current.onScroll(scroll(400));
  });
  expect(host.result.current.collapseProgress.value).toBe(1);
  await act(() => host.result.current.onScroll(scroll(250)));
  expect(host.result.current.collapseProgress.value).toBe(0);
});

test('restored scroll does not collapse controls and switching content resets them', async () => {
  const host = await renderHook((id: string) => useReadingActionBar(id, 34), {
    initialProps: 'answer-a',
  });
  await act(() => host.result.current.onScroll(scroll(600)));
  expect(host.result.current.collapseProgress.value).toBe(0);
  await act(() => {
    host.result.current.beginDrag(scroll(600));
    host.result.current.onScroll(scroll(800));
  });
  expect(host.result.current.collapseProgress.value).toBe(1);
  await host.rerender('answer-b');
  expect(host.result.current.collapseProgress.value).toBe(0);
});
