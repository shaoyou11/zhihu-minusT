import {
  InfiniteQueryObserver,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { refreshFeedQuery } from '../utils/feedRefresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  onlineManager.setOnline(true);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.mount();
});

afterEach(() => {
  unsubscribe?.();
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
});

function observe(withLaunchCache = false) {
  const queryKey = ['zhihu-feed', 'synthetic-account', 'recommend'];
  const requests: Array<{
    pageParam: number;
    signal: AbortSignal;
    result: ReturnType<typeof deferred<number>>;
  }> = [];
  const observer = new InfiniteQueryObserver(client, {
    queryKey,
    initialPageParam: 0,
    initialData: withLaunchCache ? { pages: [-1], pageParams: [0] } : undefined,
    queryFn: ({ pageParam, signal }) => {
      const result = deferred<number>();
      requests.push({ pageParam, signal, result });
      // Deliberately allow the old transport to settle after cancellation.
      return result.promise;
    },
    getNextPageParam: (lastPage) => lastPage + 1,
    staleTime: Infinity,
  });
  client.setQueryData(queryKey, {
    pages: [0, 1, 2],
    pageParams: [0, 1, 2],
  });
  unsubscribe = observer.subscribe(() => undefined);
  return { queryKey, requests, observer };
}

test('starts the first page alongside local IO and does not refetch old pages', async () => {
  const { queryKey, requests, observer } = observe();
  const keys = deferred<Set<string>>();
  const readExposureKeys = jest.fn(() => keys.promise);
  const siblingKey = [...queryKey, 'other-options'];
  const siblingData = { pages: [99], pageParams: [99] };
  client.setQueryData(siblingKey, siblingData);

  const refreshing = refreshFeedQuery(client, queryKey, readExposureKeys);
  expect(requests.map(({ pageParam }) => pageParam)).toEqual([0]);
  expect(readExposureKeys).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(siblingKey)).toEqual(siblingData);

  requests[0].result.resolve(10);
  keys.resolve(new Set(['answer:seen']));
  await expect(refreshing).resolves.toEqual(new Set(['answer:seen']));
  expect(observer.getCurrentResult().data).toEqual({
    pages: [10],
    pageParams: [0],
  });
  expect(requests).toHaveLength(1);
});

test('immediately aborts pagination even while exposure storage is slow', async () => {
  const { queryKey, requests, observer } = observe();
  const pagination = observer.fetchNextPage();
  const keys = deferred<Set<string>>();

  const refreshing = refreshFeedQuery(client, queryKey, () => keys.promise);
  expect(requests.map(({ pageParam }) => pageParam)).toEqual([3, 0]);
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].signal.aborted).toBe(false);

  requests[1].result.resolve(10);
  keys.resolve(new Set());
  await refreshing;
  requests[0].result.resolve(999);
  await pagination;
  expect(observer.getCurrentResult().data).toEqual({
    pages: [10],
    pageParams: [0],
  });
});

test('failed refresh does not apply new exposure keys and can retry once', async () => {
  const { queryKey, requests, observer } = observe();
  const keys = new Set(['answer:old-visible-card']);
  const refreshing = refreshFeedQuery(client, queryKey, async () => keys);
  requests[0].result.reject(new Error('synthetic refresh failure'));
  await expect(refreshing).resolves.toBeUndefined();
  expect(observer.getCurrentResult().isError).toBe(true);

  const retry = refreshFeedQuery(client, queryKey, async () => keys);
  requests[1].result.resolve(10);
  await expect(retry).resolves.toBe(keys);
  expect(requests.map(({ pageParam }) => pageParam)).toEqual([0, 0]);
  expect(observer.getCurrentResult().isError).toBe(false);
});

test.each([
  false,
  true,
])('an offline reset preserves its paused first page with launch cache %s', async (withLaunchCache) => {
  const { queryKey, requests, observer } = observe(withLaunchCache);
  onlineManager.setOnline(false);
  await expect(
    refreshFeedQuery(client, queryKey, async () => new Set(['answer:seen'])),
  ).resolves.toBeUndefined();
  expect(observer.getCurrentResult().isPaused).toBe(true);
  expect(observer.getCurrentResult().isPending).toBe(!withLaunchCache);
  expect(observer.getCurrentResult().isError).toBe(false);
  expect(requests).toHaveLength(0);

  const resumed = client
    .getQueryCache()
    .find({ queryKey, exact: true })?.promise;
  onlineManager.setOnline(true);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(requests.map(({ pageParam }) => pageParam)).toEqual([0]);
  requests[0].result.resolve(10);
  await resumed;
  expect(observer.getCurrentResult().data?.pages).toEqual([10]);
});
