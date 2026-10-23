import { act, renderHook } from '@testing-library/react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useDetailHeaderState } from '../src/hooks/useDetailHeaderState';

jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useSharedValue: (value: number) => react.useRef({ value }).current,
    useDerivedValue: (compute: () => number) => ({
      get value() {
        return compute();
      },
    }),
  };
});

interface Props {
  scope: string;
  initialCollapseOffset: number;
  scrollY?: SharedValue<number>;
}

test('measures gradual headers, resets scopes and never replaces a newer UI scroll with a delayed sample', async () => {
  let renders = 0;
  const props: Props = { scope: 'question-a', initialCollapseOffset: 100 };
  const host = await renderHook(
    ({ scope, ...options }: Props) => {
      renders += 1;
      return useDetailHeaderState(scope, options);
    },
    { initialProps: props },
  );
  expect(host.result.current.collapsed).toBe(false);
  expect(host.result.current.headerProgress.value).toBe(0);
  await act(() => host.result.current.onHeaderLayout(140));
  await act(() => host.result.current.onScrollOffset(116));
  expect(host.result.current.collapseOffset.value).toBe(140);
  expect(host.result.current.collapsed).toBe(false);
  await act(() => host.result.current.onScrollOffset(140));
  expect(host.result.current.collapsed).toBe(true);
  expect(host.result.current.headerProgress.value).toBe(1);
  const beforeSameSideScroll = renders;
  await act(() => {
    host.result.current.onScrollOffset(145);
    host.result.current.onScrollOffset(180);
  });
  expect(renders).toBe(beforeSameSideScroll);
  await act(() => {
    host.result.current.onScrollOffset(-10);
    host.result.current.onScrollOffset(Number.NaN);
    host.result.current.onHeaderLayout(0);
    host.result.current.onHeaderLayout(Number.POSITIVE_INFINITY);
  });
  expect(host.result.current.scrollY.value).toBe(0);
  expect(host.result.current.collapseOffset.value).toBe(140);
  expect(host.result.current.headerProgress.value).toBe(0);
  expect(host.result.current.collapsed).toBe(false);

  const oldScroll = host.result.current.onScrollOffset;
  const oldLayout = host.result.current.onHeaderLayout;
  await host.rerender({ ...props, scope: 'question-b' });
  expect(host.result.current.collapseOffset.value).toBe(100);
  await act(() => {
    oldScroll(900);
    oldLayout(20);
  });
  expect(host.result.current.scrollY.value).toBe(0);
  expect(host.result.current.collapseOffset.value).toBe(100);
  await host.rerender(props);
  await act(() => oldScroll(900));
  expect(host.result.current.collapsed).toBe(false);
  expect(host.result.current.headerProgress.value).toBe(0);

  const external = { value: 999 } as SharedValue<number>;
  await host.rerender({ ...props, scrollY: external });
  expect(host.result.current.scrollY).toBe(external);
  expect(external.value).toBe(0);
  external.value = 160;
  await act(() => host.result.current.onHeaderLayout(200));
  external.value = 190;
  await act(() => host.result.current.onScrollOffset(170));
  expect(external.value).toBe(190);
  expect(host.result.current.collapsed).toBe(false);
  external.value = 230;
  await act(() => host.result.current.onScrollOffset(205));
  expect(external.value).toBe(230);
  expect(host.result.current.collapsed).toBe(true);
  external.value = 0;
  await act(() => host.result.current.onScrollOffset(0));
  expect(host.result.current.collapsed).toBe(false);
  expect(host.result.current.headerProgress.value).toBe(0);
  const oldExternalScroll = host.result.current.onScrollOffset;
  await host.rerender({
    ...props,
    scope: 'question-c',
    scrollY: external,
    initialCollapseOffset: Number.NaN,
  });
  await act(() => oldExternalScroll(300));
  expect(host.result.current.collapseOffset.value).toBe(80);
  expect(external.value).toBe(0);
  expect(host.result.current.collapsed).toBe(false);
  await host.unmount();
});
