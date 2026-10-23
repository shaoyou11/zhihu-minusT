import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AuthStorageNotice } from '../src/components/AuthStorageNotice';

let mockFailed = true;
let mockSession = 1;
const mockRetry = jest.fn<Promise<boolean>, []>();
const mockReset = jest.fn<Promise<boolean>, []>();
const mockSync = jest.fn<Promise<void>, [string | null]>();
const mockClear = jest.fn();
const mockToast = jest.fn();
jest.mock('../modules/zhihu-persistence', () => ({
  isPersistenceNativeAvailable: () => true,
}));
jest.mock('../src/store/useAuthPersistenceStatus', () => ({
  useAuthPersistenceStatus: (
    selector: (state: { failed: boolean }) => unknown,
  ) => selector({ failed: mockFailed }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
  retryAuthPersistence: () => mockRetry(),
  resetSavedAuthState: () => mockReset(),
  useAuthStore: { getState: () => ({ cookies: 'z_c0=synthetic-restored' }) },
}));
jest.mock('../src/utils/authSession', () => ({
  syncNativeSessionCookies: (cookie: string | null) => mockSync(cookie),
}));
jest.mock('../src/utils/toast', () => ({
  showToast: (message: string) => mockToast(message),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: mockClear }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFailed = true;
  mockSession = 1;
  mockSync.mockResolvedValue();
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('reading failure offers recovery without automatically clearing accounts', async () => {
  const host = await render(<AuthStorageNotice />);
  expect(host.getByText('重试保存与恢复')).toBeTruthy();
  expect(mockReset).not.toHaveBeenCalled();
  expect(mockRetry).not.toHaveBeenCalled();
  await host.unmount();
});

test('recovery ignores duplicate presses and synchronizes a successfully restored session', async () => {
  let complete: (saved: boolean) => void = () => {};
  mockRetry.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const host = await render(<AuthStorageNotice />);
  await fireEvent.press(host.getByText('重试保存与恢复'));
  await fireEvent.press(host.getByText('正在恢复…'));
  expect(mockRetry).toHaveBeenCalledTimes(1);
  await act(() => {
    mockSession += 1;
    complete(true);
  });
  await waitFor(() =>
    expect(mockSync).toHaveBeenCalledWith('z_c0=synthetic-restored'),
  );
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenLastCalledWith('账号状态已保存');
  expect(mockReset).not.toHaveBeenCalled();
  await host.unmount();
});

test('destructive reset happens only after the explicit alert action', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockReset.mockResolvedValueOnce(true);
  const host = await render(<AuthStorageNotice />);
  await fireEvent.press(host.getByText('清除本地账号'));
  expect(mockReset).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2];
  await act(() =>
    buttons?.find((button) => button.style === 'destructive')?.onPress?.(),
  );
  await waitFor(() => expect(mockSync).toHaveBeenCalledWith(null));
  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
  await host.unmount();
});
