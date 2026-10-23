import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { touchAnswerRead } from '../src/api/zhihu/lastRead';
import { useAnswerReadTouch } from '../src/hooks/useAnswerReadTouch';

jest.mock('../src/api/zhihu/lastRead', () => ({ touchAnswerRead: jest.fn() }));
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
  jest.mocked(touchAnswerRead).mockReset().mockResolvedValue(undefined);
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

function setup(ids = ['84'], enabled = true) {
  return renderHook(
    (props: { ids: string[]; enabled: boolean }) =>
      useAnswerReadTouch(props.ids, props.enabled),
    { initialProps: { ids, enabled } },
  );
}

test('records visible bodies once per reading view, including while a request is pending', async () => {
  let finish!: () => void;
  jest.mocked(touchAnswerRead).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const host = await setup(['84', '84', '']);
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);
  expect(touchAnswerRead).toHaveBeenLastCalledWith('84', { sessionVersion: 1 });
  await host.rerender({ ids: ['84'], enabled: false });
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);
  await act(() => finish());
  await host.rerender({ ids: ['85'], enabled: true });
  expect(touchAnswerRead).toHaveBeenLastCalledWith('85', { sessionVersion: 1 });
  await host.rerender({ ids: ['84', '85'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
  await host.unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
});

test('waits for a ready body on the focused route in the foreground', async () => {
  mockFocused = false;
  AppState.currentState = 'background';
  const host = await setup(['84'], false);
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).not.toHaveBeenCalled();
  mockFocused = true;
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).not.toHaveBeenCalled();
  await act(() => changeAppState('active'));
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);

  mockFocused = false;
  await host.rerender({ ids: ['85'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await host.rerender({ ids: ['85'], enabled: false });
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);
  await host.rerender({ ids: ['85'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
  await act(() => changeAppState('inactive'));
  await host.rerender({ ids: ['86'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
});

test('skips guests and isolates deduplication across login and account changes', async () => {
  mockCookies = null;
  const host = await setup();
  expect(touchAnswerRead).not.toHaveBeenCalled();
  mockCookies = 'synthetic-authentication';
  mockSessionVersion = 2;
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenLastCalledWith('84', { sessionVersion: 2 });
  mockSessionVersion = 3;
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenLastCalledWith('84', { sessionVersion: 3 });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
});

test('absorbs failures and retries when the body becomes readable again', async () => {
  jest
    .mocked(touchAnswerRead)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await setup();
  expect(touchAnswerRead).toHaveBeenCalledTimes(1);
  await host.rerender({ ids: ['84'], enabled: false });
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
});

test('an old account failure cannot clear a new account reservation', async () => {
  let fail!: (error: Error) => void;
  jest.mocked(touchAnswerRead).mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      fail = reject;
    }),
  );
  const host = await setup();
  mockSessionVersion = 2;
  await host.rerender({ ids: ['84'], enabled: true });
  await act(() => fail(new Error('synthetic old account failure')));
  await host.rerender({ ids: ['84'], enabled: true });
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
});

test('reopening a reading view can report a new visit', async () => {
  const first = await setup();
  await first.unmount();
  await setup();
  expect(touchAnswerRead).toHaveBeenCalledTimes(2);
});
