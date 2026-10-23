import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { getAnswer } from '../src/api/zhihu';
import { useNeighborAnswerPrefetch } from '../src/hooks/useNeighborAnswerPrefetch';

jest.mock('../src/api/zhihu', () => ({ getAnswer: jest.fn() }));
jest.mock('../src/features/rich-content', () =>
  jest.requireActual('../src/features/rich-content/queryPolicy'),
);
let mockActive = true;
jest.mock('../src/hooks/useActiveScreen', () => ({
  useActiveScreen: () => mockActive,
}));
const ids = ['a', 'b', 'c', 'd', 'e'];
const clients: QueryClient[] = [];

beforeEach(() => {
  mockActive = true;
  jest.mocked(getAnswer).mockReset();
  jest.mocked(getAnswer).mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

interface PrefetchProps {
  answerIds: string[];
  currentPage: number;
  active: boolean;
}

async function renderPrefetch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const host = await renderHook(
    ({ answerIds, currentPage, active }: PrefetchProps) => {
      mockActive = active;
      useNeighborAnswerPrefetch(answerIds, currentPage);
    },
    {
      initialProps: { answerIds: ids, currentPage: 2, active: true },
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { client, host };
}

function requestedIds() {
  return jest.mocked(getAnswer).mock.calls.map((call) => call[0]);
}

function requestSignal(id: string) {
  const signal = jest
    .mocked(getAnswer)
    .mock.calls.find((call) => call[0] === id)?.[2]?.signal;
  if (!signal) throw new Error(`Missing request signal for ${id}`);
  return signal;
}

test('starts neighboring requests without waiting for an idle callback', async () => {
  const { host } = await renderPrefetch();
  expect(requestedIds()).toEqual(['b', 'd']);
  await host.unmount();
});

test('promoting a neighbor retains its request before the visible observer becomes enabled', async () => {
  const { client, host } = await renderPrefetch();
  const dSignal = requestSignal('d');
  const bSignal = requestSignal('b');
  const observer = new QueryObserver(client, {
    queryKey: ['answer-detail', 'd'],
    queryFn: ({ signal }) => getAnswer('d', undefined, { signal }),
    enabled: false,
  });
  const unsubscribe = observer.subscribe(() => {});

  await host.rerender({ answerIds: ids, currentPage: 3, active: true });

  expect(
    client
      .getQueryCache()
      .find({ queryKey: ['answer-detail', 'd'] })
      ?.isActive(),
  ).toBe(false);
  expect(dSignal.aborted).toBe(false);
  expect(bSignal.aborted).toBe(true);
  expect(requestedIds()).toEqual(['b', 'd', 'c', 'e']);
  await host.unmount();
  await act(() => unsubscribe());
});

test('list updates with the same current and neighboring IDs do not abort or duplicate requests', async () => {
  const { host } = await renderPrefetch();
  const bSignal = requestSignal('b');
  const dSignal = requestSignal('d');

  await host.rerender({
    answerIds: ['x', 'b', 'c', 'd', 'z'],
    currentPage: 2,
    active: true,
  });

  expect(bSignal.aborted).toBe(false);
  expect(dSignal.aborted).toBe(false);
  expect(requestedIds()).toEqual(['b', 'd']);
  await host.unmount();
});

test('a changed neighbor window retains shared requests and cancels abandoned work', async () => {
  const { host } = await renderPrefetch();
  const bSignal = requestSignal('b');
  const dSignal = requestSignal('d');

  await host.rerender({
    answerIds: ['a', 'b', 'c', 'f', 'e'],
    currentPage: 2,
    active: true,
  });

  expect(bSignal.aborted).toBe(false);
  expect(dSignal.aborted).toBe(true);
  expect(requestedIds()).toEqual(['b', 'd', 'f']);
  await host.unmount();
});

test('leaving the screen cancels inactive requests while retaining a visible observer', async () => {
  const { client, host } = await renderPrefetch();
  const bSignal = requestSignal('b');
  const dSignal = requestSignal('d');
  const observer = new QueryObserver(client, {
    queryKey: ['answer-detail', 'b'],
    queryFn: ({ signal }) => getAnswer('b', undefined, { signal }),
  });
  const unsubscribe = observer.subscribe(() => {});

  await host.rerender({ answerIds: ids, currentPage: 2, active: false });

  expect(bSignal.aborted).toBe(false);
  expect(dSignal.aborted).toBe(true);
  expect(requestedIds()).toEqual(['b', 'd']);
  await host.unmount();
  expect(bSignal.aborted).toBe(false);
  await act(() => unsubscribe());
});

test('unmounting cancels all inactive neighboring requests', async () => {
  const { host } = await renderPrefetch();
  const bSignal = requestSignal('b');
  const dSignal = requestSignal('d');

  await host.unmount();

  expect(bSignal.aborted).toBe(true);
  expect(dSignal.aborted).toBe(true);
});
