import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { readContents } from '../src/api/zhihu/lastRead';
import { useQuestionRead } from '../src/hooks/useQuestionRead';

jest.mock('../src/api/zhihu/lastRead', () => ({ readContents: jest.fn() }));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null) => Boolean(cookie),
}));
let mockFocused = true;
let mockSessionVersion = 1;
let mockCookies: string | null = 'synthetic-authentication';
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: string | null }) => unknown) =>
    selector({ cookies: mockCookies }),
}));

const initialAppState = AppState.currentState;
let changeAppState: (state: AppStateStatus) => void;
let removeListener: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readContents).mockReset().mockResolvedValue(undefined);
  mockFocused = true;
  mockSessionVersion = 1;
  mockCookies = 'synthetic-authentication';
  AppState.currentState = 'active';
  removeListener = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      changeAppState = listener;
      return { remove: removeListener };
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = initialAppState;
});

function setup(id = '7', ready = true, sessionVersion = mockSessionVersion) {
  return renderHook(
    (props: { id: string; ready: boolean; sessionVersion: number }) =>
      useQuestionRead(props.id, props.sessionVersion, props.ready),
    { initialProps: { id, ready, sessionVersion } },
  );
}

test('reads the entered question once per mounted view, including a pending request', async () => {
  let finish!: () => void;
  jest.mocked(readContents).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const host = await setup(' 7 ');
  expect(readContents).toHaveBeenCalledTimes(1);
  expect(readContents).toHaveBeenCalledWith([{ type: 'question', id: '7' }], {
    sessionVersion: 1,
  });
  await host.rerender({ id: '7', ready: false, sessionVersion: 1 });
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).toHaveBeenCalledTimes(1);
  await act(() => finish());
  await host.rerender({ id: '8', ready: true, sessionVersion: 1 });
  expect(readContents).toHaveBeenLastCalledWith(
    [{ type: 'question', id: '8' }],
    { sessionVersion: 1 },
  );
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).toHaveBeenCalledTimes(2);
  await host.unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
});

test('requires loaded question data, a focused route and a foreground app', async () => {
  mockFocused = false;
  AppState.currentState = 'background';
  const host = await setup('7', false);
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).not.toHaveBeenCalled();
  mockFocused = true;
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).not.toHaveBeenCalled();
  await act(() => changeAppState('active'));
  expect(readContents).toHaveBeenCalledTimes(1);
  await act(() => changeAppState('inactive'));
  await host.rerender({ id: '8', ready: true, sessionVersion: 1 });
  expect(readContents).toHaveBeenCalledTimes(1);
  await act(() => changeAppState('active'));
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('does not report guests or stale question data to a new account', async () => {
  mockCookies = null;
  const host = await setup();
  expect(readContents).not.toHaveBeenCalled();
  mockCookies = 'synthetic-authentication';
  mockSessionVersion = 2;
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).not.toHaveBeenCalled();
  await host.rerender({ id: '7', ready: false, sessionVersion: 2 });
  expect(readContents).not.toHaveBeenCalled();
  await host.rerender({ id: '7', ready: true, sessionVersion: 2 });
  expect(readContents).toHaveBeenLastCalledWith(
    [{ type: 'question', id: '7' }],
    { sessionVersion: 2 },
  );
});

test('a failed read stays silent and retries after the next focus opportunity', async () => {
  jest
    .mocked(readContents)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await setup();
  expect(readContents).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  mockFocused = true;
  await host.rerender({ id: '7', ready: true, sessionVersion: 1 });
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('an old session failure cannot clear the current session reservation', async () => {
  let fail!: (error: Error) => void;
  jest.mocked(readContents).mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      fail = reject;
    }),
  );
  const host = await setup();
  mockSessionVersion = 2;
  await host.rerender({ id: '7', ready: true, sessionVersion: 2 });
  await act(() => fail(new Error('synthetic old session failure')));
  await host.rerender({ id: '7', ready: false, sessionVersion: 2 });
  await host.rerender({ id: '7', ready: true, sessionVersion: 2 });
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('a fresh mounted question page reports another visit', async () => {
  const first = await setup();
  await first.unmount();
  await setup();
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('does not report an empty question ID', async () => {
  await setup(' \t ');
  expect(readContents).not.toHaveBeenCalled();
});
