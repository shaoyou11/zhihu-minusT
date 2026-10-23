import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { inspectApk } from '../modules/zhihu-persistence';
import { fetchUpdateText } from '../src/api/githubReleases';
import {
  type ApkUpdate,
  cleanupUpdatePartials,
  discardVerifiedApk,
  downloadAndInstallVerifiedApk,
  downloadVerifiedApk,
  installVerifiedApk,
  UPDATE_CANCEL_TIMEOUT_MS,
  UPDATE_DOWNLOAD_TIMEOUT_MS,
} from '../src/utils/updateDownload';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///test/cache/',
  documentDirectory: 'file:///test/documents/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readDirectoryAsync: jest.fn(async () => []),
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  createDownloadResumable: jest.fn(),
  getContentUriAsync: jest.fn(async () => 'content://synthetic-verified-apk'),
}));
jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('../modules/zhihu-persistence', () => ({ inspectApk: jest.fn() }));
jest.mock('../src/api/githubReleases', () => ({ fetchUpdateText: jest.fn() }));

const name = 'zhihu-minus-minus-v0.8.0-arm64-v8a.apk';
const sha = 'a'.repeat(64);
const update: ApkUpdate = {
  tag: 'v0.8.0',
  asset: {
    name,
    browser_download_url: `https://github.com/shaoyou11/zhihu-minusT/releases/download/v0.8.0/${name}`,
    size: 64,
    sha256: sha,
  },
};
let targetUri: string;
let progress: Parameters<typeof FileSystem.createDownloadResumable>[3];
const download = jest.fn<
  Promise<FileSystem.FileSystemDownloadResult | undefined>,
  []
>();
const cancel = jest.fn(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  download.mockImplementation(async () => ({
    uri: targetUri,
    status: 200,
    headers: {},
    mimeType: 'application/vnd.android.package-archive',
  }));
  cancel.mockResolvedValue(undefined);
  jest
    .mocked(inspectApk)
    .mockResolvedValue({ size: 64, sha256: sha, isZip: true });
  jest
    .mocked(FileSystem.createDownloadResumable)
    .mockImplementation((_url, uri, _options, callback) => {
      targetUri = uri;
      progress = callback;
      // Only these methods are used by the download pipeline.
      return {
        downloadAsync: download,
        cancelAsync: cancel,
      } as unknown as FileSystem.DownloadResumable;
    });
});
afterEach(() => jest.useRealTimers());

test.each([name, name.replace('-arm64-', '-preview-arm64-')])(
  'verifies %s before moving the private partial file and launching installation',
  async (assetName) => {
    await downloadAndInstallVerifiedApk({
      ...update,
      asset: {
        ...update.asset,
        name: assetName,
        browser_download_url: update.asset.browser_download_url.replace(
          name,
          assetName,
        ),
      },
    });
    expect(inspectApk).toHaveBeenCalledWith(expect.stringMatching(/\.part$/));
    expect(FileSystem.moveAsync).toHaveBeenCalledWith({
      from: targetUri,
      to: expect.stringMatching(/\.apk$/),
    });
    expect(IntentLauncher.startActivityAsync).toHaveBeenCalledWith(
      'android.intent.action.VIEW',
      {
        data: 'content://synthetic-verified-apk',
        flags: 1 | 0x10000000,
        type: 'application/vnd.android.package-archive',
      },
    );
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
      idempotent: true,
    });
  },
);

test.each([
  { size: 63, sha256: sha, isZip: true },
  { size: 64, sha256: 'b'.repeat(64), isZip: true },
  { size: 64, sha256: sha, isZip: false },
])(
  'rejects incomplete, altered or non-ZIP packages without opening an installer',
  async (inspection) => {
    jest.mocked(inspectApk).mockResolvedValue(inspection);
    await expect(downloadAndInstallVerifiedApk(update)).rejects.toMatchObject({
      code: 'integrity',
    });
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
      idempotent: true,
    });
  },
);

test('uses SHA256SUMS for older assets whose API digest is absent', async () => {
  jest.mocked(fetchUpdateText).mockResolvedValue(`${sha}  ./${name}\n`);
  await downloadAndInstallVerifiedApk({
    ...update,
    asset: { ...update.asset, sha256: null },
    checksumAsset: {
      name: 'SHA256SUMS.txt',
      size: 100,
      sha256: null,
      browser_download_url: update.asset.browser_download_url.replace(
        name,
        'SHA256SUMS.txt',
      ),
    },
  });
  expect(fetchUpdateText).toHaveBeenCalledWith(
    expect.stringMatching(/SHA256SUMS.txt$/),
    expect.objectContaining({ asset: true, signal: expect.anything() }),
  );
  expect(IntentLauncher.startActivityAsync).toHaveBeenCalledTimes(1);
});

test('rejects assets with no digest before allocating a download task', async () => {
  await expect(
    downloadVerifiedApk({
      ...update,
      asset: { ...update.asset, sha256: null },
    }),
  ).rejects.toMatchObject({ code: 'integrity' });
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
});

test('cancels active native downloads and removes their partial files', async () => {
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  download.mockImplementation(() => {
    started?.();
    return new Promise(() => undefined);
  });
  const controller = new AbortController();
  const pending = downloadAndInstallVerifiedApk(update, {
    signal: controller.signal,
  });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await began;
  controller.abort();
  await failed;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
    idempotent: true,
  });
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
});

test('ignores an inspection that completes after cancellation', async () => {
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest.mocked(inspectApk).mockImplementation(
    () =>
      new Promise((resolve) => {
        started?.();
        finish = () => resolve({ size: 64, sha256: sha, isZip: true });
      }),
  );
  const controller = new AbortController();
  const pending = downloadAndInstallVerifiedApk(update, {
    signal: controller.signal,
  });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await began;
  controller.abort();
  await failed;
  finish?.();
  await Promise.resolve();
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'] as const)(
  'removes a cancelled partial again if the native transfer finishes late with %s',
  async (outcome) => {
    let finish: (() => void) | undefined;
    let started: (() => void) | undefined;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    download.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          started?.();
          finish = () => {
            if (outcome === 'resolve')
              resolve({
                uri: targetUri,
                status: 200,
                headers: {},
                mimeType: 'application/vnd.android.package-archive',
              });
            else reject(new Error('synthetic late network error'));
          };
        }),
    );
    const controller = new AbortController();
    const pending = downloadVerifiedApk(update, { signal: controller.signal });
    const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await began;
    controller.abort();
    await failed;
    jest.mocked(FileSystem.deleteAsync).mockClear();
    finish?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
      idempotent: true,
    });
    expect(inspectApk).not.toHaveBeenCalled();
  },
);

test('cancels a stalled content URI operation without ever opening the installer', async () => {
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  jest.mocked(FileSystem.getContentUriAsync).mockImplementationOnce(() => {
    started?.();
    return new Promise(() => undefined);
  });
  const controller = new AbortController();
  const pending = downloadAndInstallVerifiedApk(update, {
    signal: controller.signal,
  });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await began;
  controller.abort();
  await failed;
  const verified = jest.mocked(FileSystem.moveAsync).mock.calls[0][0].to;
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
    idempotent: true,
  });
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
});

test('cancelling a stalled native cancellation still returns within a bounded time', async () => {
  jest.useFakeTimers();
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  download.mockImplementation(() => {
    started?.();
    return new Promise(() => undefined);
  });
  cancel.mockImplementation(() => new Promise(() => undefined));
  const controller = new AbortController();
  const pending = downloadVerifiedApk(update, { signal: controller.signal });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await began;
  controller.abort();
  await jest.advanceTimersByTimeAsync(UPDATE_CANCEL_TIMEOUT_MS);
  await failed;
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
    idempotent: true,
  });
});

test('cancel after verification prevents installation and removes the verified file', async () => {
  const controller = new AbortController();
  jest
    .mocked(FileSystem.getContentUriAsync)
    .mockImplementationOnce(async () => {
      controller.abort();
      return 'content://synthetic-verified-apk';
    });
  await expect(
    downloadAndInstallVerifiedApk(update, { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'cancelled' });
  const verified = jest.mocked(FileSystem.moveAsync).mock.calls[0][0].to;
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
    idempotent: true,
  });
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('keeps each verified handoff immutable across subsequent downloads', async () => {
  const first = await downloadVerifiedApk(update);
  const second = await downloadVerifiedApk(update);
  expect(second).not.toBe(first);
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(first, {
    idempotent: true,
  });
});

test('cleans a verified APK when neither installer nor share handoff succeeds', async () => {
  jest
    .mocked(IntentLauncher.startActivityAsync)
    .mockRejectedValueOnce(new Error());
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error());
  await expect(downloadAndInstallVerifiedApk(update)).rejects.toMatchObject({
    code: 'storage',
  });
  const verified = jest.mocked(FileSystem.moveAsync).mock.calls[0][0].to;
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
    idempotent: true,
  });
});

test('cleans both owned file paths if finalizing the verified APK fails', async () => {
  jest.mocked(FileSystem.moveAsync).mockRejectedValueOnce(new Error());
  await expect(downloadAndInstallVerifiedApk(update)).rejects.toMatchObject({
    code: 'storage',
  });
  const verified = jest.mocked(FileSystem.moveAsync).mock.calls[0][0].to;
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
    idempotent: true,
  });
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
    idempotent: true,
  });
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
});

test('stops oversized transport responses before they can be inspected or installed', async () => {
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  download.mockImplementation(() => {
    started?.();
    return new Promise(() => undefined);
  });
  const pending = downloadVerifiedApk(update);
  const failed = expect(pending).rejects.toMatchObject({ code: 'integrity' });
  await began;
  progress?.({ totalBytesWritten: 65, totalBytesExpectedToWrite: 64 });
  await failed;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(inspectApk).not.toHaveBeenCalled();
});

test('a stalled download times out and cleans up its partial file', async () => {
  jest.useFakeTimers();
  download.mockImplementation(() => new Promise(() => undefined));
  const pending = downloadVerifiedApk(update);
  const failed = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_TIMEOUT_MS);
  await failed;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(targetUri, {
    idempotent: true,
  });
});

test('cleans interrupted updater partials without touching other application files', async () => {
  jest
    .mocked(FileSystem.readDirectoryAsync)
    .mockResolvedValue([
      'zhihu-update-build.apk.123-1.part',
      'auth-storage.json',
      'another.part',
    ]);
  await cleanupUpdatePartials();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///test/cache/updates/zhihu-update-build.apk.123-1.part',
    { idempotent: true },
  );
});

test('retains recently handed-off APKs while removing updater APKs older than a day', async () => {
  jest
    .mocked(FileSystem.readDirectoryAsync)
    .mockResolvedValueOnce([
      'zhihu-update-old.apk',
      'zhihu-update-recent.apk',
      'unrelated.apk',
    ]);
  jest.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => ({
    uri,
    exists: true,
    isDirectory: false,
    size: 64,
    modificationTime:
      Date.now() / 1000 - (uri.endsWith('old.apk') ? 90000 : 30),
  }));
  await cleanupUpdatePartials();
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    'file:///test/cache/updates/zhihu-update-old.apk',
    { idempotent: true },
  );
});

test('stale cleanup never removes the currently active transfer', async () => {
  let started: (() => void) | undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  download.mockImplementation(() => {
    started?.();
    return new Promise(() => undefined);
  });
  const controller = new AbortController();
  const pending = downloadVerifiedApk(update, { signal: controller.signal });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await began;
  jest
    .mocked(FileSystem.readDirectoryAsync)
    .mockResolvedValueOnce([
      targetUri.slice(targetUri.lastIndexOf('/') + 1),
      'zhihu-update-interrupted.apk.123-1.part',
    ]);
  await cleanupUpdatePartials();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(targetUri, {
    idempotent: true,
  });
  controller.abort();
  await failed;
});

test('reports verification separately and never opens the installer while only downloading', async () => {
  const onPhase = jest.fn();
  const verified = await downloadVerifiedApk(update, { onPhase });
  expect(onPhase.mock.calls).toEqual([['downloading'], ['verifying']]);
  expect(verified).toMatch(/\.apk$/);
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('cancellation at the verification transition prevents inspection and installation', async () => {
  const controller = new AbortController();
  await expect(
    downloadVerifiedApk(update, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (phase === 'verifying') controller.abort();
      },
    }),
  ).rejects.toMatchObject({ code: 'cancelled' });
  expect(inspectApk).not.toHaveBeenCalled();
  expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
});

test('can retain a failed installation for retry without removing the verified file', async () => {
  const verified = await downloadVerifiedApk(update);
  jest.mocked(FileSystem.deleteAsync).mockClear();
  jest
    .mocked(IntentLauncher.startActivityAsync)
    .mockRejectedValueOnce(new Error());
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error());
  await expect(
    installVerifiedApk(verified, { retainOnFailure: true }),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  await installVerifiedApk(verified, { retainOnFailure: true });
  expect(IntentLauncher.startActivityAsync).toHaveBeenCalledTimes(2);
});

test.each([false, true])(
  'cancellation before installer handoff respects a previous handoff (%s)',
  async (alreadyHandedOff) => {
    const verified = await downloadVerifiedApk(update);
    jest.mocked(FileSystem.deleteAsync).mockClear();
    let started: (() => void) | undefined;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    jest.mocked(FileSystem.getContentUriAsync).mockImplementationOnce(() => {
      started?.();
      return new Promise(() => undefined);
    });
    const controller = new AbortController();
    const operation = installVerifiedApk(verified, {
      signal: controller.signal,
      retainOnFailure: true,
      alreadyHandedOff,
    });
    const failed = expect(operation).rejects.toMatchObject({
      code: 'cancelled',
    });
    await began;
    controller.abort();
    await failed;
    if (alreadyHandedOff) expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    else
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
        idempotent: true,
      });
    expect(IntentLauncher.startActivityAsync).not.toHaveBeenCalled();
  },
);

test('discard only accepts updater-owned verified file paths', async () => {
  const verified = await downloadVerifiedApk(update);
  jest.mocked(FileSystem.deleteAsync).mockClear();
  await discardVerifiedApk(verified);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(verified, {
    idempotent: true,
  });
  jest.mocked(FileSystem.deleteAsync).mockClear();
  await expect(
    discardVerifiedApk('file:///test/documents/auth-storage.json'),
  ).rejects.toMatchObject({ code: 'storage' });
  await expect(
    discardVerifiedApk('file:///test/cache/updates/../zhihu-update-v0.8.0.apk'),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});
