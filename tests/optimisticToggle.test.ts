import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import {
  type UseOptimisticToggleOptions,
  useOptimisticToggle,
} from '../src/hooks/useOptimisticToggle';
import { getAuthSessionVersion } from '../src/store/useAuthStore';
import { showToast } from '../src/utils/toast';

jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: jest.fn(() => 0),
}));

interface ToggleData {
  active: boolean;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(['toggle', 'a'], { active: false });
  client.setQueryData(['toggle', 'b'], { active: true });
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthSessionVersion).mockReturnValue(0);
});

test.each(['success', 'failure'] as const)(
  'keeps %s bound to the invocation key, request, messages and callbacks after rerender',
  async (outcome) => {
    const client = createClient();
    const cancellation = deferred<void>();
    jest
      .spyOn(client, 'cancelQueries')
      .mockReturnValueOnce(cancellation.promise);
    const invalidation = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const request = deferred<unknown>();
    const originalRequest = jest.fn(() => request.promise);
    const nextRequest = jest.fn(async () => ({}));
    const originalSuccess = jest.fn();
    const nextSuccess = jest.fn();
    const originalOptions: UseOptimisticToggleOptions<ToggleData> = {
      queryKey: ['toggle', 'a'],
      mutationFn: originalRequest,
      onUpdateCache: (data) => ({ active: !data.active }),
      isActive: false,
      successMessage: (wasActive) => `A:${wasActive}`,
      errorMessage: 'A failure',
      onSuccessCallback: originalSuccess,
      invalidateQueries: [['extra', 'a']],
    };
    const host = await renderHook(
      (options: UseOptimisticToggleOptions<ToggleData>) =>
        useOptimisticToggle(options),
      {
        initialProps: originalOptions,
        wrapper: ({ children }: PropsWithChildren) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    let completion: Promise<unknown> = Promise.resolve();
    await act(() => {
      completion = host.result.current
        .mutateAsync()
        .catch((error: Error) => error);
    });
    await host.rerender({
      ...originalOptions,
      queryKey: ['toggle', 'b'],
      mutationFn: nextRequest,
      isActive: true,
      successMessage: 'B success',
      errorMessage: 'B failure',
      onSuccessCallback: nextSuccess,
      invalidateQueries: [['extra', 'b']],
    });
    await act(async () => {
      cancellation.resolve(undefined);
    });
    expect(originalRequest).toHaveBeenCalledTimes(1);
    expect(nextRequest).not.toHaveBeenCalled();
    expect(client.getQueryData(['toggle', 'a'])).toEqual({ active: true });
    expect(client.getQueryData(['toggle', 'b'])).toEqual({ active: true });
    await act(async () => {
      if (outcome === 'success') request.resolve({});
      else request.reject(new Error('test failure'));
      await completion;
    });
    expect(client.getQueryData(['toggle', 'b'])).toEqual({ active: true });
    expect(client.getQueryData(['toggle', 'a'])).toEqual({
      active: outcome === 'success',
    });
    expect(showToast).toHaveBeenCalledWith(
      outcome === 'success' ? 'A:false' : 'A failure',
    );
    expect(originalSuccess).toHaveBeenCalledTimes(
      outcome === 'success' ? 1 : 0,
    );
    expect(nextSuccess).not.toHaveBeenCalled();
    expect(invalidation.mock.calls).toEqual([
      [{ queryKey: ['toggle', 'a'], exact: true }],
      [{ queryKey: ['extra', 'a'] }],
    ]);
    await host.unmount();
    client.clear();
  },
);

test('coalesces repeated invocation of one hook while its action is pending', async () => {
  const client = createClient();
  const request = deferred<unknown>();
  const mutationFn = jest.fn(() => request.promise);
  const update = jest.fn((data: ToggleData) => ({ active: !data.active }));
  const options = {
    queryKey: ['toggle', 'a'],
    mutationFn,
    onUpdateCache: update,
  };
  const host = await renderHook(
    () => ({
      one: useOptimisticToggle(options),
      two: useOptimisticToggle(options),
    }),
    {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(() => {
    first = host.result.current.one.mutateAsync();
    second = host.result.current.one.mutateAsync();
  });
  expect(second).toBe(first);
  expect(mutationFn).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['toggle', 'a'])).toEqual({ active: true });
  await act(async () => {
    request.resolve({});
    await first;
  });
  await act(() => {
    first = host.result.current.one.mutateAsync();
  });
  expect(mutationFn).toHaveBeenCalledTimes(2);
  await act(async () => {
    await first;
  });
  await host.unmount();
  client.clear();
});

test('queues different actions sharing a key and preserves the first success when the second fails', async () => {
  const client = createClient();
  client.setQueryData(['shared'], { active: false, otherActive: false });
  const firstRequest = deferred<unknown>();
  const secondRequest = deferred<unknown>();
  const firstFn = jest.fn(() => firstRequest.promise);
  const secondFn = jest.fn(() => secondRequest.promise);
  const host = await renderHook(
    () => ({
      one: useOptimisticToggle<{ active: boolean; otherActive: boolean }>({
        queryKey: ['shared'],
        mutationFn: firstFn,
        onUpdateCache: (data) => ({ ...data, active: true }),
      }),
      two: useOptimisticToggle<{ active: boolean; otherActive: boolean }>({
        queryKey: ['shared'],
        mutationFn: secondFn,
        onUpdateCache: (data) => ({ ...data, otherActive: true }),
      }),
    }),
    {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(() => {
    first = host.result.current.one.mutateAsync();
    second = host.result.current.two
      .mutateAsync()
      .catch((error: Error) => error);
  });
  expect(firstFn).toHaveBeenCalledTimes(1);
  expect(secondFn).not.toHaveBeenCalled();
  expect(host.result.current.two.isPending).toBe(true);
  expect(client.getQueryData(['shared'])).toEqual({
    active: true,
    otherActive: false,
  });
  await act(async () => {
    firstRequest.resolve({});
    await first;
  });
  expect(secondFn).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['shared'])).toEqual({
    active: true,
    otherActive: true,
  });
  await act(async () => {
    secondRequest.reject(new Error('second action failure'));
    await second;
  });
  expect(client.getQueryData(['shared'])).toEqual({
    active: true,
    otherActive: false,
  });
  expect(host.result.current.two.isPending).toBe(false);
  await host.unmount();
  client.clear();
});

test('runs actions for different query keys independently', async () => {
  const client = createClient();
  const firstRequest = deferred<unknown>();
  const secondRequest = deferred<unknown>();
  const firstFn = jest.fn(() => firstRequest.promise);
  const secondFn = jest.fn(() => secondRequest.promise);
  const host = await renderHook(
    () => ({
      one: useOptimisticToggle({
        queryKey: ['toggle', 'a'],
        mutationFn: firstFn,
      }),
      two: useOptimisticToggle({
        queryKey: ['toggle', 'b'],
        mutationFn: secondFn,
      }),
    }),
    {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(() => {
    first = host.result.current.one.mutateAsync();
    second = host.result.current.two.mutateAsync();
  });
  expect(firstFn).toHaveBeenCalledTimes(1);
  expect(secondFn).toHaveBeenCalledTimes(1);
  await act(async () => {
    firstRequest.resolve({});
    secondRequest.resolve({});
    await Promise.all([first, second]);
  });
  await host.unmount();
  client.clear();
});

test('does not restore or invalidate an old account query after the cache is cleared and recreated', async () => {
  const client = createClient();
  const request = deferred<unknown>();
  const invalidation = jest.spyOn(client, 'invalidateQueries');
  const host = await renderHook(
    () =>
      useOptimisticToggle<ToggleData>({
        queryKey: ['toggle', 'a'],
        mutationFn: () => request.promise,
        onUpdateCache: (data) => ({ active: !data.active }),
      }),
    {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let completion: Promise<unknown> = Promise.resolve();
  await act(() => {
    completion = host.result.current
      .mutateAsync()
      .catch((error: Error) => error);
  });
  client.clear();
  client.setQueryData(['toggle', 'a'], {
    active: true,
    account: 'new-synthetic-account',
  });
  await act(async () => {
    request.reject(new Error('session changed'));
    await completion;
  });
  expect(client.getQueryData(['toggle', 'a'])).toEqual({
    active: true,
    account: 'new-synthetic-account',
  });
  expect(invalidation).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('cancels a queued old-account action before it can use the new session', async () => {
  const client = createClient();
  const request = deferred<unknown>();
  const queuedRequest = jest.fn(async () => ({}));
  const host = await renderHook(
    () => ({
      one: useOptimisticToggle({
        queryKey: ['toggle', 'a'],
        mutationFn: () => request.promise,
      }),
      two: useOptimisticToggle({
        queryKey: ['toggle', 'a'],
        mutationFn: queuedRequest,
      }),
    }),
    {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(() => {
    first = host.result.current.one.mutateAsync();
    second = host.result.current.two
      .mutateAsync()
      .catch((error: Error) => error);
  });
  jest.mocked(getAuthSessionVersion).mockReturnValue(1);
  await act(async () => {
    request.resolve({});
    await Promise.all([first, second]);
  });
  expect(queuedRequest).not.toHaveBeenCalled();
  expect(await second).toMatchObject({ code: 'ERR_CANCELED' });
  expect(showToast).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('executes a new-session action for the same key while the old session is pending', async () => {
  const client = createClient();
  const oldRequest = deferred<unknown>();
  const newRequest = deferred<unknown>();
  const oldFn = jest.fn(() => oldRequest.promise);
  const newFn = jest.fn(() => newRequest.promise);
  const host = await renderHook(
    (mutationFn: () => Promise<unknown>) =>
      useOptimisticToggle({
        queryKey: ['toggle', 'a'],
        mutationFn,
      }),
    {
      initialProps: oldFn,
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(() => {
    first = host.result.current.mutateAsync().catch((error: Error) => error);
  });
  jest.mocked(getAuthSessionVersion).mockReturnValue(1);
  client.clear();
  await host.rerender(newFn);
  await act(() => {
    second = host.result.current.mutateAsync();
  });
  expect(newFn).toHaveBeenCalledTimes(1);
  expect(second).not.toBe(first);
  await act(async () => {
    newRequest.resolve({});
    oldRequest.reject(new Error('old session closed'));
    await Promise.all([first, second]);
  });
  expect(showToast).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});
