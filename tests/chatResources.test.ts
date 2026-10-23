import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getMessages } from '../src/api/zhihu';
import { useChatMessages } from '../src/hooks/useChatMessages';

jest.mock('../src/api/zhihu', () => ({ getMessages: jest.fn() }));
let mockFocused = true;
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
}));
const initialAppState = AppState.currentState;
let changeAppState: (state: AppStateStatus) => void;
let removeAppStateListener: jest.Mock;
const participant = {
  type: 'people',
  message_user_type: 'sender',
  id: 'synthetic',
  url: '',
  name: '合成',
  url_token: 'synthetic',
  user_type: 'people',
  headline: '',
  avatar_url: 'https://example.com/avatar',
};
const page = (ids: string[], next = '') => ({
  data: ids.map((id) => ({
    info: {
      id,
      type: 'message',
      url: '',
      text: `合成 ${id}`,
      created_time: 1,
      content_type: 0,
      user_type: 'sender' as const,
    },
    sender: participant,
    receiver: participant,
  })),
  paging: { is_end: !next, next, previous: '' },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  AppState.currentState = 'active';
  removeAppStateListener = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      changeAppState = listener;
      return { remove: removeAppStateListener };
    });
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  AppState.currentState = initialAppState;
});

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const host = await renderHook(
    ({ focused }: { focused: boolean }) => {
      mockFocused = focused;
      return useChatMessages('synthetic-target', 'id:synthetic-account');
    },
    {
      initialProps: { focused: true },
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return { client, host };
}

test('polling fetches one head page and preserves messages between the head and historical cursor', async () => {
  jest
    .mocked(getMessages)
    .mockResolvedValueOnce(page(['m3', 'm2'], 'https://example.com/older'))
    .mockResolvedValueOnce(page(['m1']))
    .mockResolvedValueOnce(
      page(['m4', 'm3'], 'https://example.com/new-cursor'),
    );
  const { client, host } = await setup();
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  await act(async () => {
    await host.result.current.fetchNextPage();
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(
    host.result.current.messages.map((message) => message.info.id),
  ).toEqual(['m3', 'm2', 'm1']);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  expect(getMessages).toHaveBeenCalledTimes(3);
  expect(jest.mocked(getMessages).mock.calls[2][1]).toBe('');
  expect(
    host.result.current.messages.map((message) => message.info.id),
  ).toEqual(['m4', 'm3', 'm2', 'm1']);
  await host.rerender({ focused: false });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(20000);
  });
  expect(getMessages).toHaveBeenCalledTimes(3);
  await host.unmount();
  expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  client.clear();
});

test('loss of focus or foreground state cancels the in-flight latest page', async () => {
  jest.mocked(getMessages).mockImplementation(() => new Promise(() => {}));
  const { client, host } = await setup();
  const signal = jest.mocked(getMessages).mock.calls[0][2]?.signal;
  expect(signal?.aborted).toBe(false);
  await act(() => changeAppState('background'));
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10000);
  });
  expect(getMessages).toHaveBeenCalledTimes(1);
  await act(async () => {
    changeAppState('active');
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(getMessages).toHaveBeenCalledTimes(2);
  const resumedSignal = jest.mocked(getMessages).mock.calls[1][2]?.signal;
  expect(resumedSignal?.aborted).toBe(false);
  await host.rerender({ focused: false });
  expect(resumedSignal?.aborted).toBe(true);
  await host.unmount();
  expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  client.clear();
});
