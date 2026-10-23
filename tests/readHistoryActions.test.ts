import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { batchDelReadHistory } from '../src/api/zhihu/history';
import { useReadHistoryActions } from '../src/hooks/useReadHistoryActions';

jest.mock('../src/api/zhihu/history', () => ({
  batchDelReadHistory: jest.fn(),
}));
let mockSession = 0;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
}));

async function setup() {
  const client = new QueryClient();
  const reset = jest.spyOn(client, 'resetQueries');
  const host = await renderHook(() => useReadHistoryActions(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { client, host, reset };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = 0;
});

test('overlapping clear and delete actions perform one request and reset only history', async () => {
  let finish: () => void = () => {};
  jest.mocked(batchDelReadHistory).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host, reset } = await setup();
  client.setQueryData(['read-history'], { pages: [1, 2], pageParams: [0, 20] });
  client.setQueryData(['unrelated-list'], 'keep');
  let first: Promise<boolean> | undefined;
  let duplicate: Promise<boolean> | undefined;
  await act(() => {
    first = host.result.current.deleteHistory({ clear: true });
    duplicate = host.result.current.deleteHistory({
      clear: false,
      pairs: [{ content_token: '42', content_type: 'answer' }],
    });
  });
  expect(await duplicate).toBe(false);
  expect(batchDelReadHistory).toHaveBeenCalledTimes(1);
  expect(host.result.current.isPending).toBe(true);
  await act(async () => {
    finish();
    await first;
  });
  expect(await first).toBe(true);
  expect(reset).toHaveBeenCalledWith({
    queryKey: ['read-history'],
    exact: true,
  });
  expect(client.getQueryData(['read-history'])).toBeUndefined();
  expect(client.getQueryData(['unrelated-list'])).toBe('keep');
  expect(host.result.current.isPending).toBe(false);
  await host.unmount();
  client.clear();
});

test('late deletion cannot clear or refresh the next account history', async () => {
  let finish: () => void = () => {};
  jest.mocked(batchDelReadHistory).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host, reset } = await setup();
  let deletion: Promise<boolean> | undefined;
  await act(() => {
    deletion = host.result.current.deleteHistory({ clear: true });
  });
  await act(async () => {
    mockSession += 1;
    client.setQueryData(['read-history'], 'next-account');
    finish();
    await deletion;
  });
  expect(await deletion).toBe(false);
  expect(reset).not.toHaveBeenCalled();
  expect(client.getQueryData(['read-history'])).toBe('next-account');
  await host.unmount();
  client.clear();
});
