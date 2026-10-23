import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type PropsWithChildren, StrictMode } from 'react';
import { Alert } from 'react-native';
import { deletePin } from '../src/api/zhihu/pin';
import { usePinActions } from '../src/hooks/usePinActions';
import type { ZhihuPin } from '../src/types/zhihu';
import { isPinOwner } from '../src/utils/pinOwnership';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSession = 0;
let mockAuthState: {
  me: { id: string; url_token: string } | null;
  cookies: string | null;
} = { me: { id: 'owner', url_token: 'owner-token' }, cookies: 'synthetic' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('../src/api/zhihu/pin', () => ({ deletePin: jest.fn() }));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuthState) => unknown) =>
      selector(mockAuthState),
    { getState: () => mockAuthState },
  ),
}));
jest.mock('../src/utils/zhihuError', () => ({
  getZhihuErrorMessage: () => '合成删除失败',
}));

const pin: Pick<ZhihuPin, 'id' | 'author'> = {
  id: '42',
  author: {
    id: 'owner',
    type: 'people',
    url_token: 'owner-token',
    name: '合成作者',
    avatar_url: '',
  },
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function setup(strict = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const host = await renderHook(
    ({ currentPin }: { currentPin: typeof pin | undefined }) =>
      usePinActions(currentPin),
    {
      initialProps: { currentPin: pin },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
          {strict ? <StrictMode>{children}</StrictMode> : children}
        </QueryClientProvider>
      ),
    },
  );
  const action = (key: string) => {
    const option = host.result.current.find((item) => item.key === key);
    if (!option) throw new Error(`missing action: ${key}`);
    return option;
  };
  const confirm = () => {
    const call = alert.mock.calls.findLast((args) => args[0] === '删除想法？');
    const button = call?.[2]?.find((item) => item.style === 'destructive');
    if (!button?.onPress) throw new Error('missing delete confirmation');
    button.onPress();
  };
  return { host, client, invalidate, alert, action, confirm };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = 0;
  mockAuthState = {
    me: { id: 'owner', url_token: 'owner-token' },
    cookies: 'synthetic',
  };
  jest.mocked(deletePin).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

test('ownership requires authentication and matching stable account identity', () => {
  expect(isPinOwner(pin.author, mockAuthState.me, true)).toBe(true);
  expect(isPinOwner(pin.author, mockAuthState.me, false)).toBe(false);
  expect(isPinOwner(pin.author, null, true)).toBe(false);
  expect(isPinOwner(undefined, mockAuthState.me, true)).toBe(false);
  expect(
    isPinOwner(pin.author, { id: 'other', url_token: 'owner-token' }, true),
  ).toBe(false);
  expect(
    isPinOwner(
      { url_token: 'owner-token' },
      { url_token: 'owner-token' },
      true,
    ),
  ).toBe(true);
  expect(isPinOwner({}, {}, true)).toBe(false);
});

test('only the owner receives edit and delete options, and edit opens the selected pin', async () => {
  const { host, client, action } = await setup();
  expect(host.result.current.map((item) => item.key)).toEqual([
    'edit-pin',
    'delete-pin',
  ]);
  await act(() => action('edit-pin').onPress());
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/publish/pin',
    params: { id: '42' },
  });
  mockAuthState = {
    me: { id: 'other', url_token: 'other-token' },
    cookies: 'synthetic',
  };
  mockSession += 1;
  await host.rerender({ currentPin: pin });
  expect(host.result.current).toEqual([]);
  mockAuthState = { me: null, cookies: null };
  mockSession += 1;
  await host.rerender({ currentPin: pin });
  expect(host.result.current).toEqual([]);
  await host.unmount();
  client.clear();
});

test('deletion waits for confirmation, blocks duplicate confirmation and invalidates affected views on success', async () => {
  const request = deferred();
  jest.mocked(deletePin).mockReturnValueOnce(request.promise);
  const { host, client, invalidate, alert, action, confirm } = await setup();
  await act(() => action('delete-pin').onPress());
  expect(deletePin).not.toHaveBeenCalled();
  await act(() => {
    confirm();
    confirm();
  });
  expect(deletePin).toHaveBeenCalledTimes(1);
  expect(deletePin).toHaveBeenCalledWith('42');
  await waitFor(() => expect(action('delete-pin').disabled).toBe(true));
  await act(() => action('delete-pin').onPress());
  expect(
    alert.mock.calls.filter((args) => args[0] === '删除想法？'),
  ).toHaveLength(1);
  await act(() => request.resolve());
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(invalidate.mock.calls.map((args) => args[0]?.queryKey)).toEqual([
    ['pin-detail'],
    ['zhihu-feed'],
    ['user-recent-published-activities'],
    ['user-pins'],
    ['user-activities'],
  ]);
  expect(alert).toHaveBeenCalledWith('删除成功', '想法已删除');
  await host.unmount();
  client.clear();
});

test('failed deletion retains the page and permits a confirmed retry', async () => {
  jest.mocked(deletePin).mockRejectedValueOnce(new Error('synthetic failure'));
  const { host, client, invalidate, alert, action, confirm } = await setup();
  await act(() => action('delete-pin').onPress());
  await act(() => confirm());
  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith('删除失败', '合成删除失败'),
  );
  expect(mockBack).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  await act(() => action('delete-pin').onPress());
  await act(() => confirm());
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(deletePin).toHaveBeenCalledTimes(2);
  await host.unmount();
  client.clear();
});

test('an old confirmation cannot delete after an account change even before the hook rerenders', async () => {
  const { host, client, action, confirm } = await setup();
  await act(() => action('delete-pin').onPress());
  mockAuthState = {
    me: { id: 'other', url_token: 'other-token' },
    cookies: 'next-synthetic',
  };
  mockSession += 1;
  await act(() => confirm());
  expect(deletePin).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test.each(['success', 'failure'])(
  'a late %s cannot navigate, alert or invalidate caches in a different account session',
  async (outcome) => {
    const request = deferred();
    jest.mocked(deletePin).mockReturnValueOnce(request.promise);
    const { host, client, invalidate, alert, action, confirm } = await setup();
    await act(() => action('delete-pin').onPress());
    await act(() => confirm());
    await waitFor(() => expect(deletePin).toHaveBeenCalledTimes(1));
    mockAuthState = {
      me: { id: 'other', url_token: 'other-token' },
      cookies: 'next-synthetic',
    };
    mockSession += 1;
    await host.rerender({ currentPin: pin });
    await act(() => {
      if (outcome === 'success') request.resolve();
      else request.reject(new Error('synthetic late failure'));
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(
      alert.mock.calls.filter((args) => args[0] === '删除成功'),
    ).toHaveLength(0);
    expect(
      alert.mock.calls.filter((args) => args[0] === '删除失败'),
    ).toHaveLength(0);
    await host.unmount();
    client.clear();
  },
);

test('actions remain usable through Strict Mode mount and effect cleanup checks', async () => {
  const { host, client, action } = await setup(true);
  await act(() => action('edit-pin').onPress());
  expect(mockPush).toHaveBeenCalledTimes(1);
  await host.unmount();
  client.clear();
});
