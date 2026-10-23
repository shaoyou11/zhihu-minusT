import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import {
  addToCollection,
  getAllContentCollectionStatus,
  removeFromCollection,
} from '../src/api/zhihu/collection';
import {
  collectionSelectorStatusKey,
  useCollectionSelectionToggle,
} from '../src/hooks/useCollectionSelectionToggle';
import { useCollectionStore } from '../src/store/useCollectionStore';

type FolderMutationResponse = Awaited<ReturnType<typeof addToCollection>>;

jest.mock('../src/api/zhihu/collection', () => ({
  addToCollection: jest.fn(),
  addArticleToCollection: jest.fn(),
  removeFromCollection: jest.fn(),
  removeArticleFromCollection: jest.fn(),
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../src/utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
let mockSessionVersion = 0;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
}));

beforeEach(() => {
  mockSessionVersion = 0;
  jest.clearAllMocks();
});

test('updates the original content after the selector closes or switches', async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  useCollectionStore.setState({
    collectedStatusMap: { original: false, next: true },
    collectedCountOffsetMap: {},
  });
  client.setQueryData(collectionSelectorStatusKey('original', 'answer'), {
    data: [{ id: 'folder', is_favorited: false }],
  });
  let finish: () => void = () => {};
  jest.mocked(addToCollection).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({});
      }),
  );
  jest.mocked(getAllContentCollectionStatus).mockResolvedValue({
    data: [
      {
        id: 'folder',
        title: '合成收藏夹',
        is_public: true,
        is_favorited: true,
      },
    ],
  });
  const host = await renderHook(() => useCollectionSelectionToggle(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  let completion: Promise<unknown> = Promise.resolve();
  await act(() => {
    completion = host.result.current.mutateAsync({
      contentId: 'original',
      contentType: 'answer',
      folderId: 'folder',
      isFavorited: false,
    });
  });
  await act(() =>
    useCollectionStore.getState().openSelector('next', 'article'),
  );
  await act(async () => {
    finish();
    await completion;
  });
  expect(addToCollection).toHaveBeenCalledWith('folder', 'original');
  expect(getAllContentCollectionStatus).toHaveBeenCalledWith(
    'original',
    'answer',
  );
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({
    original: true,
    next: true,
  });
  expect(useCollectionStore.getState().collectedCountOffsetMap).toEqual({
    original: 1,
  });
  await host.unmount();
  client.clear();
});

test.each(['both-success', 'reverse-failure'] as const)(
  'does not double-count overlapping folder writes (%s)',
  async (scenario) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    useCollectionStore.setState({
      collectedStatusMap: { original: false },
      collectedCountOffsetMap: {},
    });
    const pending: Array<{
      resolve: (value: FolderMutationResponse) => void;
      reject: (error: Error) => void;
    }> = [];
    const mutation = () =>
      new Promise<FolderMutationResponse>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    jest.mocked(addToCollection).mockImplementation(mutation);
    jest.mocked(removeFromCollection).mockImplementation(mutation);
    jest.mocked(getAllContentCollectionStatus).mockResolvedValue({
      data: [
        {
          id: 'folder',
          title: '合成收藏夹',
          is_public: true,
          is_favorited: true,
        },
      ],
    });
    const host = await renderHook(() => useCollectionSelectionToggle(), {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    });
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    await act(() => {
      first = host.result.current.mutateAsync({
        contentId: 'original',
        contentType: 'answer',
        folderId: 'folder',
        isFavorited: false,
      });
      second = host.result.current
        .mutateAsync({
          contentId: 'original',
          contentType: 'answer',
          folderId: 'other-folder',
          isFavorited: scenario === 'reverse-failure',
        })
        .catch(() => undefined);
    });
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[0].resolve({});
      await first;
    });
    await act(async () => {
      if (scenario === 'both-success') pending[1].resolve({});
      else pending[1].reject(new Error('synthetic failure'));
      await second;
    });
    expect(useCollectionStore.getState().collectedStatusMap.original).toBe(
      true,
    );
    expect(useCollectionStore.getState().collectedCountOffsetMap.original).toBe(
      1,
    );
    await host.unmount();
    client.clear();
  },
);

test('does not write the previous account collection state after an account switch', async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  let finish: (value: FolderMutationResponse) => void = () => {};
  jest.mocked(addToCollection).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = await renderHook(() => useCollectionSelectionToggle(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  let completion: Promise<unknown> = Promise.resolve();
  await act(() => {
    completion = host.result.current.mutateAsync({
      contentId: 'original',
      contentType: 'answer',
      folderId: 'folder',
      isFavorited: false,
    });
  });
  mockSessionVersion += 1;
  useCollectionStore.setState({
    collectedStatusMap: { next: true },
    collectedCountOffsetMap: {},
  });
  client.clear();
  await act(async () => {
    finish({});
    await completion;
  });
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({
    next: true,
  });
  expect(useCollectionStore.getState().collectedCountOffsetMap).toEqual({});
  await host.unmount();
  client.clear();
});
