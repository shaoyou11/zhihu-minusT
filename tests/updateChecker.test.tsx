import {
  act,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  getGithubReleaseHistory,
  getLatestGithubRelease,
} from '../src/api/githubReleases';
import {
  getReleaseHistory,
  getUpdateInfo,
  UpdateChecker,
  useCheckUpdate,
} from '../src/components/UpdateChecker';
import { showToast } from '../src/utils/toast';
import {
  cleanupUpdatePartials,
  downloadVerifiedApk,
  installVerifiedApk,
} from '../src/utils/updateDownload';
import { UpdateFailure } from '../src/utils/updateSecurity';

let mockDialogActions: { label: string; onPress: () => void }[] = [];

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.7.0' } },
}));
jest.mock('expo-device', () => ({ supportedCpuArchitectures: ['arm64-v8a'] }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../src/api/githubReleases', () => ({
  getLatestGithubRelease: jest.fn(),
  getGithubReleaseHistory: jest.fn(),
}));
jest.mock('../src/utils/updateDownload', () => ({
  cleanupUpdatePartials: jest.fn(async () => undefined),
  downloadVerifiedApk: jest.fn(),
  installVerifiedApk: jest.fn(async () => undefined),
  discardVerifiedApk: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/components/Themed', () => ({
  Text: require('react-native').Text,
  useRuntimeThemeColors: () => ({
    primary: '#007aff',
    onPrimary: '#ffffff',
    text: '#222222',
    toastSurface: '#ffffff',
    link: '#007aff',
    border: '#dddddd',
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: require('react-native').Pressable,
}));
jest.mock('../src/components/MarkdownText', () => ({
  MarkdownText: () => null,
}));
jest.mock('../src/components/overlays/AppDialog', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    AppDialog: ({
      title,
      actions,
      children,
    }: {
      title: string;
      actions?: { label: string; onPress: () => void }[];
      children: React.ReactNode;
    }) => {
      mockDialogActions = actions ?? [];
      return (
        <View testID="update-prompt">
          <Text>{title}</Text>
          {children}
          {actions?.map((action) => (
            <Pressable key={action.label} onPress={action.onPress}>
              <Text>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    },
  };
});

const release = {
  tag: 'v0.8.0',
  name: 'v0.8.0',
  notes: 'Synthetic notes',
  prerelease: false,
  publishedAt: null,
  url: 'https://github.com/shaoyou11/zhihu-minusT/releases/tag/v0.8.0',
  assets: [
    {
      name: 'zhihu-minus-minus-v0.8.0-arm64-v8a.apk',
      size: 64,
      sha256: 'a'.repeat(64),
      browser_download_url:
        'https://github.com/shaoyou11/zhihu-minusT/releases/download/v0.8.0/zhihu-minus-minus-v0.8.0-arm64-v8a.apk',
    },
  ],
};
const previousOS = require('react-native').Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  require('react-native').Platform.OS = 'android';
  jest.mocked(getLatestGithubRelease).mockResolvedValue(release);
  jest.mocked(cleanupUpdatePartials).mockResolvedValue(undefined);
  jest
    .mocked(downloadVerifiedApk)
    .mockImplementation(() => new Promise(() => undefined));
});
afterEach(() => {
  require('react-native').Platform.OS = previousOS;
  jest.useRealTimers();
});

test('preserves About/history exports and includes an APK only when integrity metadata is available', async () => {
  expect(await getUpdateInfo()).toMatchObject({
    updateAvailable: true,
    apkUrl: release.assets[0].browser_download_url,
  });
  jest.mocked(getLatestGithubRelease).mockResolvedValue({
    ...release,
    assets: [{ ...release.assets[0], sha256: null }],
  });
  expect((await getUpdateInfo()).apkUrl).toBeUndefined();
  jest.mocked(getGithubReleaseHistory).mockResolvedValue([release]);
  expect(await getReleaseHistory()).toEqual(
    [{ ...release, assets: undefined }].map(
      ({ assets: _assets, ...value }) => value,
    ),
  );
});

test('cancels its delayed check when the hook unmounts before the timer', async () => {
  const available = jest.fn();
  const hook = await renderHook(() => useCheckUpdate(available));
  await hook.unmount();
  await act(() => jest.advanceTimersByTimeAsync(2000));
  expect(getLatestGithubRelease).not.toHaveBeenCalled();
});

test('ignores a metadata response that arrives after unmount', async () => {
  let finish: (() => void) | undefined;
  jest.mocked(getLatestGithubRelease).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(release);
      }),
  );
  const available = jest.fn();
  const hook = await renderHook(() => useCheckUpdate(available));
  await act(() => jest.advanceTimersByTimeAsync(2000));
  const signal = jest.mocked(getLatestGithubRelease).mock.calls[0]?.[0]?.signal;
  await hook.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.();
    await Promise.resolve();
  });
  expect(available).not.toHaveBeenCalled();
});

test.each(['cancel', 'unmount'] as const)(
  'aborts a running update on %s without showing an error toast',
  async (operation) => {
    let rejectDownload: ((error: Error) => void) | undefined;
    jest.mocked(downloadVerifiedApk).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectDownload = reject;
        }),
    );
    const screen = await render(<UpdateChecker />);
    await act(() => jest.advanceTimersByTimeAsync(2000));
    await fireEvent.press(screen.getByText('直接更新'));
    const signal = jest.mocked(downloadVerifiedApk).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    if (operation === 'cancel') await fireEvent.press(screen.getByText('取消'));
    else await screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      rejectDownload?.(new UpdateFailure('cancelled'));
      await Promise.resolve();
    });
    expect(showToast).not.toHaveBeenCalled();
  },
);

test('keeps surrounding routes interactive during download and waits for an explicit install press', async () => {
  let finish: ((uri: string) => void) | undefined;
  jest.mocked(downloadVerifiedApk).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  function Root() {
    const [page, setPage] = useState('首页');
    return (
      <View>
        <Text>{page}</Text>
        <Pressable onPress={() => setPage('回答正文')}>
          <Text>继续阅读</Text>
        </Pressable>
        <UpdateChecker />
      </View>
    );
  }
  const screen = await render(<Root />);
  await act(() => jest.advanceTimersByTimeAsync(2000));
  await fireEvent.press(screen.getByText('直接更新'));
  expect(screen.queryByTestId('update-prompt')).toBeNull();
  expect(
    screen.getByTestId('update-download-overlay').props.pointerEvents,
  ).toBe('box-none');
  await fireEvent.press(screen.getByText('继续阅读'));
  expect(screen.getByText('回答正文')).toBeTruthy();
  const options = jest.mocked(downloadVerifiedApk).mock.calls[0]?.[1];
  await act(() => options?.onProgress?.(0.5));
  expect(screen.getByText(/50.0%/)).toBeTruthy();
  await act(() => options?.onPhase?.('verifying'));
  expect(screen.getByText('正在校验更新')).toBeTruthy();
  await act(() => options?.onProgress?.(1));
  expect(screen.getByText('正在校验更新')).toBeTruthy();
  await act(() => finish?.('file:///verified.apk'));
  expect(screen.getByText('安装')).toBeTruthy();
  expect(installVerifiedApk).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('安装'));
  expect(installVerifiedApk).toHaveBeenCalledTimes(1);
  // Returning from the system installer does not establish installation success.
  expect(screen.getByText('安装')).toBeTruthy();
});

test('shows download failures and retry in the bar without reopening a modal', async () => {
  jest
    .mocked(downloadVerifiedApk)
    .mockRejectedValueOnce(new UpdateFailure('request'));
  const screen = await render(<UpdateChecker />);
  await act(() => jest.advanceTimersByTimeAsync(2000));
  await fireEvent.press(screen.getByText('直接更新'));
  expect(screen.queryByTestId('update-prompt')).toBeNull();
  expect(screen.getByText(new UpdateFailure('request').message)).toBeTruthy();
  await fireEvent.press(screen.getByText('重试'));
  expect(downloadVerifiedApk).toHaveBeenCalledTimes(2);
  expect(screen.getByText('取消')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  await screen.unmount();
});

test('waits for stale partial cleanup before creating a new download task', async () => {
  let finishCleanup: (() => void) | undefined;
  jest.mocked(cleanupUpdatePartials).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishCleanup = resolve;
      }),
  );
  jest.mocked(downloadVerifiedApk).mockResolvedValue('file:///verified.apk');
  const screen = await render(<UpdateChecker />);
  await act(() => jest.advanceTimersByTimeAsync(2000));
  await fireEvent.press(screen.getByText('直接更新'));
  expect(downloadVerifiedApk).not.toHaveBeenCalled();
  await act(async () => {
    finishCleanup?.();
    await Promise.resolve();
  });
  expect(downloadVerifiedApk).toHaveBeenCalledTimes(1);
});

test('double tapping update starts only one download', async () => {
  jest
    .mocked(downloadVerifiedApk)
    .mockImplementation(() => new Promise(() => undefined));
  const screen = await render(<UpdateChecker />);
  await act(() => jest.advanceTimersByTimeAsync(2000));
  const start = mockDialogActions.find(
    (action) => action.label === '直接更新',
  )?.onPress;
  expect(start).toBeDefined();
  await act(() => {
    start?.();
    start?.();
  });
  expect(downloadVerifiedApk).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

test.each(['cancel', 'unmount'] as const)(
  'does not start a download after %s while startup cleanup is pending',
  async (operation) => {
    let finishCleanup: (() => void) | undefined;
    jest.mocked(cleanupUpdatePartials).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const screen = await render(<UpdateChecker />);
    await act(() => jest.advanceTimersByTimeAsync(2000));
    await fireEvent.press(screen.getByText('直接更新'));
    if (operation === 'cancel') await fireEvent.press(screen.getByText('取消'));
    else await screen.unmount();
    await act(async () => {
      finishCleanup?.();
      await Promise.resolve();
    });
    expect(downloadVerifiedApk).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  },
);
