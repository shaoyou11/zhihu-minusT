import { act, renderHook } from '@testing-library/react-native';
import type { ViewInstance } from 'react-native';
import { useAnswerPreviewAutoLoad } from '../src/hooks/useAnswerPreviewAutoLoad';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }),
}));

type MeasureCallback = Parameters<ViewInstance['measureInWindow']>[0];

test('continues only near visible expanded footers, coalesces scrolls, and rejects concurrent and old scope work', async () => {
  let now = 1000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  let frameId = 0;
  const frames = new Map<number, Parameters<typeof requestAnimationFrame>[0]>();
  const animation = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
  const cancel = jest
    .spyOn(global, 'cancelAnimationFrame')
    .mockImplementation((id) => {
      if (id != null) frames.delete(id);
    });
  const flushFrame = async () => {
    await act(() => {
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback(now);
    });
  };
  const measuresA: MeasureCallback[] = [];
  const measuresB: MeasureCallback[] = [];
  const invisibleMeasure = jest.fn();
  const collapsedMeasure = jest.fn();
  let resolveA: (() => void) | undefined;
  let resolveB: (() => void) | undefined;
  const loaderA = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveA = resolve;
      }),
  );
  const loaderB = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveB = resolve;
      }),
  );
  const ignoredLoader = jest.fn(async () => {});
  const props = {
    scope: 'scope-a',
    expandedIds: new Set(['a', 'b', 'invisible']),
    navigationHeight: 80,
  };
  const host = await renderHook(useAnswerPreviewAutoLoad, {
    initialProps: props,
  });
  await act(() => {
    host.result.current.registerFooter('a', {
      measureInWindow: (callback) => measuresA.push(callback),
    });
    host.result.current.registerFooter('b', {
      measureInWindow: (callback) => measuresB.push(callback),
    });
    host.result.current.registerFooter('invisible', {
      measureInWindow: invisibleMeasure,
    });
    host.result.current.registerFooter('collapsed', {
      measureInWindow: collapsedMeasure,
    });
    host.result.current.registerLoader('a', loaderA);
    host.result.current.registerLoader('b', loaderB);
    host.result.current.registerLoader('invisible', ignoredLoader);
    host.result.current.registerLoader('collapsed', ignoredLoader);
    host.result.current.onViewableItemsChanged({
      viewableItems: [
        { item: { id: 'a', type: 'answer' } },
        { item: { id: 'b', type: 'answer' } },
        { item: { id: 'collapsed', type: 'answer' } },
        { item: { id: 'invisible', type: 'answer' }, isViewable: false },
        { item: { id: 'login', type: 'login_prompt' } },
      ],
    });
    host.result.current.onFooterLayout();
  });
  expect(frames.size).toBe(1);
  await flushFrame();
  expect(invisibleMeasure).not.toHaveBeenCalled();
  expect(collapsedMeasure).not.toHaveBeenCalled();
  await act(() => {
    measuresA.at(-1)?.(0, 1400, 350, 44);
    measuresB.at(-1)?.(0, 1200, 350, 44);
  });
  expect(loaderA).not.toHaveBeenCalled();
  expect(loaderB).not.toHaveBeenCalled();

  await act(() => host.result.current.onScroll());
  await flushFrame();
  await act(() => measuresA.at(-1)?.(0, 1100, 350, 44));
  expect(loaderA).toHaveBeenCalledTimes(1);
  await act(() => measuresB.at(-1)?.(0, 500, 350, 44));
  expect(loaderB).not.toHaveBeenCalled();
  await act(() => {
    now += 16;
    host.result.current.onScroll();
    now += 16;
    host.result.current.onScroll();
  });
  expect(frames.size).toBe(0);
  await act(() => {
    host.result.current.registerLoader('a', null);
    host.result.current.onFooterLayout();
  });
  await flushFrame();
  expect(measuresB).toHaveLength(2);
  await act(async () => resolveA?.());
  expect(loaderB).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  await flushFrame();
  await act(() => measuresB.at(-1)?.(0, 1300, 350, 44));
  expect(loaderB).not.toHaveBeenCalled();

  await act(() => {
    now += 150;
    host.result.current.onScroll();
    host.result.current.onScroll();
  });
  expect(frames.size).toBe(1);
  await flushFrame();
  const oldMeasure = measuresB.at(-1);
  const oldViewability = host.result.current.onViewableItemsChanged;
  const oldRegister = host.result.current.registerLoader;
  await act(() => oldMeasure?.(0, 700, 350, 44));
  expect(loaderB).toHaveBeenCalledTimes(1);

  const newMeasures: MeasureCallback[] = [];
  const newLoader = jest.fn(async () => {});
  await host.rerender({
    ...props,
    scope: 'scope-b',
    expandedIds: new Set(['b']),
  });
  await act(() => {
    host.result.current.registerFooter('b', {
      measureInWindow: (callback) => newMeasures.push(callback),
    });
    host.result.current.registerLoader('b', newLoader);
    host.result.current.onViewableItemsChanged({
      viewableItems: [{ item: { id: 'b', type: 'answer' } }],
    });
    oldViewability({ viewableItems: [{ item: { id: 'a', type: 'answer' } }] });
    oldRegister('b', ignoredLoader);
    oldMeasure?.(0, 500, 350, 44);
  });
  await flushFrame();
  expect(newMeasures).toHaveLength(0);
  expect(newLoader).not.toHaveBeenCalled();
  await act(async () => resolveB?.());
  await flushFrame();
  await act(() => oldMeasure?.(0, 500, 350, 44));
  expect(newLoader).not.toHaveBeenCalled();
  await act(async () => newMeasures.at(-1)?.(0, 700, 350, 44));
  expect(newLoader).toHaveBeenCalledTimes(1);
  expect(ignoredLoader).not.toHaveBeenCalled();
  // Settling a request alone cannot reuse its old footer to chase more pages.
  expect(frames.size).toBe(0);

  await act(() => host.result.current.onScrollEnd());
  await flushFrame();
  const unmountedMeasure = newMeasures.at(-1);
  await host.unmount();
  await act(() => unmountedMeasure?.(0, 700, 350, 44));
  expect(newLoader).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  clock.mockRestore();
  animation.mockRestore();
  cancel.mockRestore();
});
