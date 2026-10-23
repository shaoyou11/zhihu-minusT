import { act, renderHook } from '@testing-library/react-native';
import { useUpdateDownload } from '../src/hooks/useUpdateDownload';
import {
  type ApkUpdate,
  cleanupUpdatePartials,
  discardVerifiedApk,
  downloadVerifiedApk,
  installVerifiedApk,
} from '../src/utils/updateDownload';
import { UpdateFailure } from '../src/utils/updateSecurity';

jest.mock('../src/utils/updateDownload', () => ({
  cleanupUpdatePartials: jest.fn(),
  discardVerifiedApk: jest.fn(),
  downloadVerifiedApk: jest.fn(),
  installVerifiedApk: jest.fn(),
}));

const uri = 'file:///cache/updates/zhihu-update-v0.8.0-1.apk';
const update: ApkUpdate = {
  tag: 'v0.8.0',
  asset: {
    name: 'zhihu-minus-minus-v0.8.0-arm64-v8a.apk',
    size: 64,
    sha256: 'a'.repeat(64),
    browser_download_url:
      'https://github.com/huamurui/zhihu-minus-minus/releases/download/v0.8.0/zhihu-minus-minus-v0.8.0-arm64-v8a.apk',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(cleanupUpdatePartials).mockResolvedValue(undefined);
  jest.mocked(discardVerifiedApk).mockResolvedValue(undefined);
  jest.mocked(downloadVerifiedApk).mockResolvedValue(uri);
  jest.mocked(installVerifiedApk).mockResolvedValue(undefined);
});

test.each(['dismiss', 'unmount'] as const)(
  'cleans a verified APK on %s before any installer handoff',
  async (operation) => {
    const hook = await renderHook(useUpdateDownload);
    await act(() => hook.result.current.start(update));
    expect(hook.result.current.state?.phase).toBe('ready');
    expect(installVerifiedApk).not.toHaveBeenCalled();
    if (operation === 'dismiss') await act(() => hook.result.current.dismiss());
    else await hook.unmount();
    expect(discardVerifiedApk).toHaveBeenCalledWith(uri);
  },
);

test('a stale install handler cannot open an APK after dismissal has claimed cleanup', async () => {
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  const { dismiss, install } = hook.result.current;
  await act(() => {
    dismiss();
    install();
  });
  expect(discardVerifiedApk).toHaveBeenCalledTimes(1);
  expect(installVerifiedApk).not.toHaveBeenCalled();
  expect(hook.result.current.state).toBeNull();
});

test('installation locks dismissal and double taps, then retains handoff for another install', async () => {
  let finish: (() => void) | undefined;
  jest.mocked(installVerifiedApk).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  const { install, dismiss } = hook.result.current;
  await act(() => {
    install();
    install();
    dismiss();
  });
  expect(installVerifiedApk).toHaveBeenCalledTimes(1);
  expect(discardVerifiedApk).not.toHaveBeenCalled();
  expect(hook.result.current.state?.phase).toBe('installing');
  await act(() => finish?.());
  expect(hook.result.current.state?.phase).toBe('ready');
  await act(() => hook.result.current.install());
  expect(installVerifiedApk).toHaveBeenLastCalledWith(
    uri,
    expect.objectContaining({ alreadyHandedOff: true }),
  );
  await act(() => hook.result.current.dismiss());
  expect(discardVerifiedApk).not.toHaveBeenCalled();
});

test('installer failure retries the verified file without downloading it again', async () => {
  jest
    .mocked(installVerifiedApk)
    .mockRejectedValueOnce(new UpdateFailure('storage'));
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  await act(() => hook.result.current.install());
  expect(hook.result.current.state).toMatchObject({ phase: 'failed', uri });
  expect(discardVerifiedApk).not.toHaveBeenCalled();
  await act(() => hook.result.current.retry());
  expect(downloadVerifiedApk).toHaveBeenCalledTimes(1);
  expect(installVerifiedApk).toHaveBeenCalledTimes(2);
  expect(hook.result.current.state?.phase).toBe('ready');
});

test('closing after installer failure cleans its unhanded file', async () => {
  jest
    .mocked(installVerifiedApk)
    .mockRejectedValueOnce(new UpdateFailure('storage'));
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  await act(() => hook.result.current.install());
  await act(() => hook.result.current.dismiss());
  expect(discardVerifiedApk).toHaveBeenCalledWith(uri);
});

test('a late successful transfer after cancellation is discarded and its callbacks cannot affect a new task', async () => {
  let finish: ((uri: string) => void) | undefined;
  jest.mocked(downloadVerifiedApk).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  const firstOptions = jest.mocked(downloadVerifiedApk).mock.calls[0][1];
  await act(() => hook.result.current.cancel());
  expect(firstOptions?.signal?.aborted).toBe(true);
  await act(() => {
    firstOptions?.onPhase?.('verifying');
    firstOptions?.onProgress?.(0.8);
    finish?.(uri);
  });
  expect(hook.result.current.state).toBeNull();
  expect(discardVerifiedApk).toHaveBeenCalledWith(uri);
  jest
    .mocked(downloadVerifiedApk)
    .mockImplementationOnce(() => new Promise(() => undefined));
  await act(() => hook.result.current.start(update));
  await act(() => {
    firstOptions?.onProgress?.(0.9);
    firstOptions?.onPhase?.('verifying');
  });
  expect(hook.result.current.state).toMatchObject({
    phase: 'downloading',
    progress: 0,
  });
  await hook.unmount();
});

test('a late verified file after root unmount is discarded without invoking the installer', async () => {
  let finish: ((uri: string) => void) | undefined;
  jest.mocked(downloadVerifiedApk).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = await renderHook(useUpdateDownload);
  await act(() => hook.result.current.start(update));
  await hook.unmount();
  await act(() => finish?.(uri));
  expect(discardVerifiedApk).toHaveBeenCalledWith(uri);
  expect(installVerifiedApk).not.toHaveBeenCalled();
});
