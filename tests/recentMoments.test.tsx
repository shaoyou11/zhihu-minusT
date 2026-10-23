import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Try } from 'expo-router/build/views/Try';
import type { PropsWithChildren, ReactNode } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  fetchRecentMoments,
  markRecentMomentsRead,
  type RecentMomentItem,
  type RecentMomentsResponse,
} from '../src/api/zhihu';
import { RecentMoments } from '../src/components/RecentMoments';
import { StableAvatar } from '../src/components/StableAvatar';
import { useNestedHorizontalGesture } from '../src/hooks/useNestedHorizontalGesture';
import { getDiagnosticContext } from '../src/utils/diagnosticContext';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-router/build/views/Splash', () => ({ hideAsync: jest.fn() }));
jest.mock('../src/api/zhihu', () => ({
  fetchRecentMoments: jest.fn(),
  markRecentMomentsRead: jest.fn(),
}));
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../src/hooks/useNestedHorizontalGesture', () => ({
  useNestedHorizontalGesture: jest.fn(
    jest.requireActual('../src/hooks/useNestedHorizontalGesture')
      .useNestedHorizontalGesture,
  ),
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: jest.fn(() => null),
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function moment(urlToken = 'synthetic-token'): RecentMomentItem {
  return {
    id: 'synthetic-moment',
    brief: 'synthetic-read-token',
    actor: {
      id: 'synthetic-actor-id',
      url_token: urlToken,
      name: '合成用户',
      avatar_url: '',
    },
    unread_count: 137,
  };
}

function seed(items: RecentMomentItem[]) {
  return queryClient.setQueryData<RecentMomentsResponse>(['recent-moments'], {
    data: items,
    paging: {
      is_end: true,
      is_start: true,
      next: '',
      previous: '',
      totals: items.length,
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(StableAvatar).mockImplementation(() => null);
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  jest
    .mocked(fetchRecentMoments)
    .mockImplementation(() => new Promise<RecentMomentsResponse>(() => {}));
});

afterEach(() => queryClient.clear());

test.each([
  ['synthetic-token', 'synthetic-token'],
  ['', 'synthetic-actor-id'],
])(
  'opens the selected actor using token %j without marking unseen content read',
  async (urlToken, expectedId) => {
    const item = moment(urlToken);
    const before = seed([item]);
    const host = await render(<RecentMoments />, { wrapper });

    await fireEvent.press(host.getByText(item.actor.name));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/user/[id]/stream',
      params: {
        id: expectedId,
        unreadCount: '137',
        source: 'recent-moments',
      },
    });
    expect(markRecentMomentsRead).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['recent-moments'])).toEqual(before);
    await host.unmount();
  },
);

test('annotates a child render failure before forwarding the same error to the root boundary', async () => {
  seed([moment()]);
  const failure = new Error('synthetic avatar render failure');
  jest.mocked(StableAvatar).mockImplementation(() => {
    throw failure;
  });
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  let caught: Error | undefined;
  function RootFallback({ error }: ErrorBoundaryProps) {
    caught = error;
    return null;
  }

  try {
    const host = await render(
      <Try catch={RootFallback}>
        <RecentMoments />
      </Try>,
      { wrapper },
    );

    expect(caught).toBe(failure);
    expect(getDiagnosticContext(caught)).toEqual({
      area: 'following.recent-moments',
      operation: 'render',
    });
    await host.unmount();
  } finally {
    consoleError.mockRestore();
  }
});

test('discards malformed entries without enabling the avatar strip gesture', async () => {
  const actor = moment().actor;
  queryClient.setQueryData<unknown>(['recent-moments'], {
    data: [
      null,
      {},
      { actor: null },
      { actor: [] },
      { actor: 'invalid' },
      { actor: { ...actor, id: {} } },
      { actor: { ...actor, id: '' } },
      { actor: { ...actor, url_token: {} } },
      { actor: { ...actor, name: {} } },
      { actor: { ...actor, avatar_url: {} } },
      { actor, unread_count: {} },
      { actor, unread_count: Number.NaN },
      { actor, unread_count: -1 },
    ],
  });
  const host = await render(<RecentMoments />, { wrapper });

  expect(host.toJSON()).toBeNull();
  expect(useNestedHorizontalGesture).toHaveBeenLastCalledWith(
    undefined,
    false,
    undefined,
  );
  expect(StableAvatar).not.toHaveBeenCalled();
  await host.unmount();
});

test('retains valid entries among malformed data and routes to the selected actor', async () => {
  const item = moment();
  const response = { data: [null, {}, item, { actor: null }] };
  queryClient.setQueryData<unknown>(['recent-moments'], response);
  const host = await render(<RecentMoments />, { wrapper });

  await fireEvent.press(host.getByText(item.actor.name));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]/stream',
    params: {
      id: item.actor.url_token,
      unreadCount: '137',
      source: 'recent-moments',
    },
  });
  expect(queryClient.getQueryData(['recent-moments'])).toEqual(response);
  await host.unmount();
});

test('allows absent optional profile fields and unread counts', async () => {
  queryClient.setQueryData<unknown>(['recent-moments'], {
    data: [
      {
        actor: {
          id: 'synthetic-actor-id',
          name: '可选字段缺省',
          url_token: null,
          avatar_url: null,
        },
      },
    ],
  });
  const host = await render(<RecentMoments />, { wrapper });

  await fireEvent.press(host.getByText('可选字段缺省'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]/stream',
    params: {
      id: 'synthetic-actor-id',
      unreadCount: '0',
      source: 'recent-moments',
    },
  });
  await host.unmount();
});

test('keeps hooks mounted across loading, empty results, restoration and focus changes', async () => {
  const onInteractionChange = jest.fn();
  const parentGesture = Gesture.Native();
  const host = await render(
    <RecentMoments
      onInteractionChange={onInteractionChange}
      parentGesture={parentGesture}
    />,
    { wrapper },
  );
  const gestureHook = jest.mocked(useNestedHorizontalGesture);
  const item = moment();
  expect(host.toJSON()).toBeNull();
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    false,
    parentGesture,
  );

  await act(() => seed([item]));
  await waitFor(() => expect(host.getByText(item.actor.name)).toBeTruthy());
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    true,
    parentGesture,
  );

  await act(() => seed([]));
  await waitFor(() => expect(host.toJSON()).toBeNull());
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    false,
    parentGesture,
  );

  await act(() => seed([item]));
  await waitFor(() => expect(host.getByText(item.actor.name)).toBeTruthy());
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    true,
    parentGesture,
  );

  await host.rerender(
    <RecentMoments
      isActive={false}
      onInteractionChange={onInteractionChange}
      parentGesture={parentGesture}
    />,
  );
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    false,
    parentGesture,
  );
  await host.rerender(
    <RecentMoments
      isActive
      onInteractionChange={onInteractionChange}
      parentGesture={parentGesture}
    />,
  );
  expect(gestureHook).toHaveBeenLastCalledWith(
    onInteractionChange,
    true,
    parentGesture,
  );
  await host.unmount();
});

test.each([{}, { data: null }, { data: { length: 1 } }, { data: 'invalid' }])(
  'handles an invalid moments array on first load and after populated results: %j',
  async (response) => {
    queryClient.setQueryData<unknown>(['recent-moments'], response);
    const host = await render(<RecentMoments />, { wrapper });
    const item = moment();
    expect(host.toJSON()).toBeNull();

    await act(() => seed([item]));
    await waitFor(() => expect(host.getByText(item.actor.name)).toBeTruthy());

    await act(() =>
      queryClient.setQueryData<unknown>(['recent-moments'], response),
    );
    await waitFor(() => expect(host.toJSON()).toBeNull());

    await act(() => seed([item]));
    await waitFor(() => expect(host.getByText(item.actor.name)).toBeTruthy());
    await host.unmount();
  },
);
