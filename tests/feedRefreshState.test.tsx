import { act, renderHook } from '@testing-library/react-native';
import { useLayoutEffect } from 'react';
import { useRefreshSnapshot } from '../hooks/useRefreshSnapshot';
import { useScopedRefreshAction } from '../hooks/useScopedRefreshAction';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  jest.useRealTimers();
});

test('coalesces duplicate pulls and releases a completed refresh without a hold timer', async () => {
  jest.useFakeTimers();
  const work = deferred();
  const scope = {};
  const action = jest.fn(() => work.promise);
  const onStateChange = jest.fn();
  const host = await renderHook(() =>
    useScopedRefreshAction(scope, action, onStateChange),
  );
  let first: Promise<void> | undefined;
  let duplicate: Promise<void> | undefined;
  await act(() => {
    first = host.result.current.refresh();
    duplicate = host.result.current.refresh();
    expect(host.result.current.isRefreshingNow()).toBe(true);
  });
  expect(first).toBe(duplicate);
  expect(action).toHaveBeenCalledTimes(1);
  expect(host.result.current.refreshing).toBe(true);

  await act(async () => {
    work.resolve();
    await first;
  });
  expect(host.result.current.refreshing).toBe(false);
  expect(host.result.current.isRefreshingNow()).toBe(false);
  expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  await host.unmount();
  jest.useRealTimers();
});

test('an old account refresh cannot block or finish a new account refresh', async () => {
  const oldWork = deferred();
  const newWork = deferred();
  const action = jest
    .fn()
    .mockImplementationOnce(() => oldWork.promise)
    .mockImplementationOnce(() => newWork.promise);
  const host = await renderHook(
    ({ scope }: { scope: object }) => useScopedRefreshAction(scope, action),
    { initialProps: { scope: {} } },
  );
  let oldRefresh: Promise<void> | undefined;
  let newRefresh: Promise<void> | undefined;
  await act(() => {
    oldRefresh = host.result.current.refresh();
  });
  await host.rerender({ scope: {} });
  expect(host.result.current.refreshing).toBe(false);
  expect(host.result.current.isRefreshingNow()).toBe(false);
  await act(() => {
    newRefresh = host.result.current.refresh();
  });
  await act(async () => {
    oldWork.resolve();
    await oldRefresh;
  });
  expect(host.result.current.refreshing).toBe(true);
  await act(async () => {
    newWork.resolve();
    await newRefresh;
  });
  expect(host.result.current.refreshing).toBe(false);
  expect(action).toHaveBeenCalledTimes(2);
  await host.unmount();
});

test('commits the native refreshing state even when work resolves immediately', async () => {
  const committedStates: boolean[] = [];
  const scope = {};
  const action = jest.fn(async () => {
    expect(committedStates.at(-1)).toBe(true);
  });
  const host = await renderHook(() => {
    const refresh = useScopedRefreshAction(scope, action);
    useLayoutEffect(() => {
      committedStates.push(refresh.refreshing);
    }, [refresh.refreshing]);
    return refresh;
  });
  let request: Promise<void> | undefined;
  await act(() => {
    request = host.result.current.refresh();
  });
  await act(async () => {
    await request;
  });
  expect(action).toHaveBeenCalledTimes(1);
  expect(committedStates).toEqual([false, true, false]);
  await host.unmount();
});

test('settles a refresh canceled by unmount before its first commit', async () => {
  const action = jest.fn(async () => undefined);
  const onStateChange = jest.fn();
  const scope = {};
  const host = await renderHook(() =>
    useScopedRefreshAction(scope, action, onStateChange),
  );
  let request: Promise<void> | undefined;
  await act(async () => {
    request = host.result.current.refresh();
    await host.unmount();
  });
  await expect(request).resolves.toBeUndefined();
  expect(action).not.toHaveBeenCalled();
  expect(onStateChange.mock.calls).toEqual([[true], [false]]);
});

test('a scope change before commit cancels work and releases its parent indicator', async () => {
  const action = jest.fn(async () => undefined);
  const onStateChange = jest.fn();
  const host = await renderHook(
    ({ scope }: { scope: object }) =>
      useScopedRefreshAction(scope, action, onStateChange),
    { initialProps: { scope: {} } },
  );
  let request: Promise<void> | undefined;
  await act(async () => {
    request = host.result.current.refresh();
    await host.rerender({ scope: {} });
  });
  await expect(request).resolves.toBeUndefined();
  expect(action).not.toHaveBeenCalled();
  expect(onStateChange.mock.calls).toEqual([[true], [false]]);
  expect(host.result.current.refreshing).toBe(false);
  await host.unmount();
});

test('a failed action releases the refresh gate and allows another pull', async () => {
  const scope = {};
  const action = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic action failure'))
    .mockResolvedValueOnce(undefined);
  const host = await renderHook(() => useScopedRefreshAction(scope, action));
  let failed: Promise<void> | undefined;
  await act(() => {
    failed = host.result.current.refresh();
    // Attach the error observer before the committed action can reject.
    void failed.catch(() => undefined);
  });
  await expect(failed).rejects.toThrow('synthetic action failure');
  expect(host.result.current.refreshing).toBe(false);
  let retried: Promise<void> | undefined;
  await act(() => {
    retried = host.result.current.refresh();
  });
  await act(async () => {
    await retried;
  });
  expect(action).toHaveBeenCalledTimes(2);
  expect(host.result.current.refreshing).toBe(false);
  await host.unmount();
});

test('retains displayed pages through reset and failure, replacing them after retry', async () => {
  const scope = {};
  const cached = { pages: ['old-1', 'old-2'] };
  const fresh = { pages: ['fresh'] };
  interface Props {
    scope: object;
    data: typeof cached | undefined;
    refreshing: boolean;
    failed: boolean;
  }
  const host = await renderHook(
    ({ scope, data, refreshing, failed }: Props) =>
      useRefreshSnapshot(scope, data, refreshing, failed),
    {
      initialProps: {
        scope,
        data: cached,
        refreshing: false,
        failed: false,
      },
    },
  );
  await host.rerender({
    scope,
    data: undefined,
    refreshing: true,
    failed: false,
  });
  expect(host.result.current).toBe(cached);
  await host.rerender({
    scope,
    data: undefined,
    refreshing: false,
    failed: true,
  });
  expect(host.result.current).toBe(cached);
  await host.rerender({
    scope,
    data: fresh,
    refreshing: true,
    failed: false,
  });
  expect(host.result.current).toBe(cached);
  await host.rerender({
    scope,
    data: fresh,
    refreshing: false,
    failed: false,
  });
  expect(host.result.current).toBe(fresh);
  await host.rerender({
    scope: {},
    data: undefined,
    refreshing: true,
    failed: false,
  });
  expect(host.result.current).toBeUndefined();
  await host.unmount();
});

test('keeps cached cards when offline reset finishes before its paused request', async () => {
  const scope = {};
  const cached = ['old'];
  const host = await renderHook(
    ({
      data,
      refreshing,
      pending,
    }: {
      data: string[] | undefined;
      refreshing: boolean;
      pending: boolean;
    }) => useRefreshSnapshot(scope, data, refreshing, pending),
    { initialProps: { data: cached, refreshing: false, pending: false } },
  );
  await host.rerender({ data: undefined, refreshing: true, pending: true });
  await host.rerender({ data: undefined, refreshing: false, pending: true });
  expect(host.result.current).toBe(cached);
  const fresh = ['fresh'];
  await host.rerender({ data: fresh, refreshing: false, pending: false });
  expect(host.result.current).toBe(fresh);
  await host.unmount();
});
