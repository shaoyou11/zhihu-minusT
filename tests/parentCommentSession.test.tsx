import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { type CommentItem, getComment } from '../src/api/zhihu/comment';
import { useParentComment } from '../src/hooks/useParentComment';
import { useAuthStore } from '../src/store/useAuthStore';
import {
  parseParentComment,
  serializeParentComment,
} from '../src/utils/commentRoute';

let mockSessionVersion = 1;
jest.mock('../src/api/zhihu/comment', () => ({ getComment: jest.fn() }));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: jest.requireActual('zustand').create(() => ({
    cookies: 'synthetic-account',
    me: { id: 'synthetic-owner' },
  })),
}));

const parent: CommentItem = {
  id: 'root',
  type: 'comment',
  content: '合成评论 100% 与 %20',
  created_time: 1,
  author: {
    member: {
      id: 'synthetic-author',
      url_token: 'synthetic-author',
      name: '合成作者',
      avatar_url: '',
      is_following: true,
    },
  },
  is_author: true,
  author_tag: [{ type: 'following', text: '我关注的人' }],
  comment_tag: [{ type: 'hot', text: '热评' }],
  can_delete: true,
  allow_delete: true,
  relationship: { voting: 1 },
  child_comment_count: 0,
  child_comments: [],
};
const currentParent: CommentItem = {
  ...parent,
  author: { member: { ...parent.author.member, is_following: false } },
  is_author: false,
  can_delete: false,
  allow_delete: false,
  author_tag: [],
  comment_tag: [],
  relationship: { voting: 0 },
};

function deferred() {
  let resolve!: (value: CommentItem) => void;
  const promise = new Promise<CommentItem>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function setupClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: 'synthetic-account' });
});

test('a parent snapshot is reusable only in the exact login session that produced it', async () => {
  const serialized = serializeParentComment(parent, 1);
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useParentComment('root', serialized), {
    wrapper,
  });
  expect(getComment).not.toHaveBeenCalled();
  expect(host.result.current.parentComment?.content).toBe(parent.content);
  expect(host.result.current.parentComment).toMatchObject({
    author: { member: { is_following: true } },
    can_delete: true,
    allow_delete: true,
    author_tag: parent.author_tag,
    relationship: { voting: 1 },
  });
  expect(parseParentComment(serialized, 'root', 2)).toBeNull();
  expect(parseParentComment(serialized, 'other-root', 1)).toBeNull();
  await host.unmount();
  client.clear();
});

test.each([
  JSON.stringify(parent),
  JSON.stringify({ comment: parent }),
  JSON.stringify({ comment: parent, sessionVersion: '1' }),
  JSON.stringify({ comment: parent, sessionVersion: 0 }),
  undefined,
])(
  'missing or invalid session snapshots ignore legacy caches and reload every parent field: %s',
  async (snapshot) => {
    const request = deferred();
    jest.mocked(getComment).mockReturnValueOnce(request.promise);
    const { client, wrapper } = setupClient();
    client.setQueryData(['parent-comment', 'root'], parent);
    const host = await renderHook(() => useParentComment('root', snapshot), {
      wrapper,
    });
    expect(host.result.current.parentComment).toBeUndefined();
    await waitFor(() => expect(getComment).toHaveBeenCalledWith('root'));
    await act(() => request.resolve(currentParent));
    await waitFor(() =>
      expect(host.result.current.parentComment).toEqual(currentParent),
    );
    expect(client.getQueryData(['parent-comment', 'root', 1])).toEqual(
      currentParent,
    );
    await host.unmount();
    client.clear();
  },
);

test.each(['another account', 'the same account after login'])(
  'changing the session for %s drops the entire route snapshot before the replacement request resolves',
  async (change) => {
    const request = deferred();
    jest.mocked(getComment).mockReturnValueOnce(request.promise);
    const snapshot = serializeParentComment(parent, 1);
    const { client, wrapper } = setupClient();
    client.setQueryData(['parent-comment', 'root', 1], parent);
    const host = await renderHook(() => useParentComment('root', snapshot), {
      wrapper,
    });
    expect(host.result.current.parentComment?.can_delete).toBe(true);
    await act(() => {
      mockSessionVersion += 1;
      useAuthStore.setState(
        change === 'another account'
          ? { cookies: 'synthetic-next-account' }
          : {},
      );
    });
    expect(host.result.current.sessionVersion).toBe(2);
    expect(host.result.current.parentComment).toBeUndefined();
    await waitFor(() => expect(getComment).toHaveBeenCalledTimes(1));
    await act(() => request.resolve(currentParent));
    await waitFor(() =>
      expect(host.result.current.parentComment).toEqual(currentParent),
    );
    expect(client.getQueryData(['parent-comment', 'root', 1])).toEqual(parent);
    expect(client.getQueryData(['parent-comment', 'root', 2])).toEqual(
      currentParent,
    );
    await host.unmount();
    client.clear();
  },
);

test('a response started in the old session cannot populate either the new view or the old cache', async () => {
  const previousRequest = deferred();
  const currentRequest = deferred();
  jest
    .mocked(getComment)
    .mockReturnValueOnce(previousRequest.promise)
    .mockReturnValueOnce(currentRequest.promise);
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useParentComment('root', undefined), {
    wrapper,
  });
  await waitFor(() => expect(getComment).toHaveBeenCalledTimes(1));
  await act(() => {
    mockSessionVersion += 1;
    useAuthStore.setState({});
  });
  await waitFor(() => expect(getComment).toHaveBeenCalledTimes(2));
  await act(() => previousRequest.resolve(parent));
  expect(host.result.current.parentComment).toBeUndefined();
  expect(client.getQueryData(['parent-comment', 'root', 1])).toBeUndefined();
  await act(() => currentRequest.resolve(currentParent));
  await waitFor(() =>
    expect(host.result.current.parentComment).toEqual(currentParent),
  );
  await host.unmount();
  client.clear();
});
