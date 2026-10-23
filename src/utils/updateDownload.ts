import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { fetchUpdateText } from '@/api/githubReleases';
import { inspectApk } from '@/modules/zhihu-persistence';
import {
  assertUpdateActive,
  type GithubReleaseAsset,
  isTrustedAssetUrl,
  MAX_APK_DOWNLOAD_BYTES,
  MAX_CHECKSUM_BYTES,
  parseAssetChecksum,
  UpdateFailure,
  verifyApkInspection,
} from './updateSecurity';

export const UPDATE_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export const UPDATE_CANCEL_TIMEOUT_MS = 5_000;
const VERIFIED_APK_RETENTION_SECONDS = 24 * 60 * 60;
const activePartials = new Set<string>();
let sequence = 0;

export interface ApkUpdate {
  tag: string;
  asset: GithubReleaseAsset;
  checksumAsset?: GithubReleaseAsset;
}

export interface ApkDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  onPhase?: (phase: 'downloading' | 'verifying') => void;
}

function updateDirectory(): string {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base?.startsWith('file://')) throw new UpdateFailure('storage');
  return `${base.endsWith('/') ? base : `${base}/`}updates/`;
}

async function removeFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {
    console.warn('清理更新临时文件失败');
  });
}

/** Discard an updater-owned verified APK that has not reached the installer. */
export async function discardVerifiedApk(uri: string): Promise<void> {
  const directory = updateDirectory();
  if (
    !uri.startsWith(directory) ||
    !/^zhihu-update-[\w.-]+\.apk$/.test(uri.slice(directory.length))
  )
    throw new UpdateFailure('storage');
  await removeFile(uri);
}

/** Only files owned by this updater are eligible for interrupted-task cleanup. */
export async function cleanupUpdatePartials(): Promise<void> {
  const directory = updateDirectory();
  if (!(await FileSystem.getInfoAsync(directory)).exists) return;
  for (const filename of await FileSystem.readDirectoryAsync(directory)) {
    const uri = `${directory}${filename}`;
    if (activePartials.has(uri)) continue;
    if (/^zhihu-update-[\w.-]+\.part$/.test(filename)) await removeFile(uri);
    else if (/^zhihu-update-[\w.-]+\.apk$/.test(filename)) {
      const info = await FileSystem.getInfoAsync(uri);
      if (
        info.exists &&
        !info.isDirectory &&
        typeof info.modificationTime === 'number' &&
        Date.now() / 1000 - info.modificationTime >
          VERIFIED_APK_RETENTION_SECONDS
      )
        await removeFile(uri);
    }
  }
}

async function settleCancellation(operation: Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, UPDATE_CANCEL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  failure: () => UpdateFailure,
): Promise<T> {
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(failure());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

export async function downloadVerifiedApk(
  update: ApkUpdate,
  options: ApkDownloadOptions = {},
): Promise<string> {
  assertUpdateActive(options.signal);
  const { asset, tag, checksumAsset } = update;
  if (!isTrustedAssetUrl(asset.browser_download_url, tag, asset.name))
    throw new UpdateFailure('url');
  if (!asset.name.endsWith('.apk')) throw new UpdateFailure('metadata');
  if (
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > MAX_APK_DOWNLOAD_BYTES
  )
    throw new UpdateFailure('metadata');
  const directory = updateDirectory();
  const controller = new AbortController();
  let abortCode: 'cancelled' | 'timeout' | 'integrity' = 'cancelled';
  let task: FileSystem.DownloadResumable | undefined;
  let cancelTask: Promise<void> | undefined;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    abortCode = 'timeout';
    abort();
  }, UPDATE_DOWNLOAD_TIMEOUT_MS);
  const stopDownload = () => {
    if (task) cancelTask = task.cancelAsync().catch(() => undefined);
  };
  controller.signal.addEventListener('abort', stopDownload, { once: true });
  const failure = () => new UpdateFailure(abortCode);
  // A unique verified file remains stable while the external installer reads it.
  const finalUri = `${directory}zhihu-update-${tag}-${Date.now()}-${++sequence}.apk`;
  const partialUri = `${finalUri}.part`;
  let completed = false;
  try {
    let sha256 = asset.sha256;
    if (sha256 === null) {
      if (
        checksumAsset?.name !== 'SHA256SUMS.txt' ||
        !Number.isSafeInteger(checksumAsset.size) ||
        checksumAsset.size <= 0 ||
        checksumAsset.size > MAX_CHECKSUM_BYTES ||
        !isTrustedAssetUrl(
          checksumAsset.browser_download_url,
          tag,
          checksumAsset.name,
        )
      )
        throw new UpdateFailure('integrity');
      sha256 = parseAssetChecksum(
        await fetchUpdateText(checksumAsset.browser_download_url, {
          signal: controller.signal,
          limit: MAX_CHECKSUM_BYTES,
          asset: true,
        }),
        asset.name,
      );
    }
    if (!/^[a-f\d]{64}$/i.test(sha256)) throw new UpdateFailure('integrity');
    assertUpdateActive(controller.signal);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    assertUpdateActive(controller.signal);
    options.onPhase?.('downloading');
    options.onProgress?.(0);
    activePartials.add(partialUri);
    task = FileSystem.createDownloadResumable(
      asset.browser_download_url,
      partialUri,
      {},
      (progress) => {
        if (controller.signal.aborted) return;
        if (
          progress.totalBytesWritten > asset.size ||
          (progress.totalBytesExpectedToWrite > 0 &&
            progress.totalBytesExpectedToWrite !== asset.size)
        ) {
          abortCode = 'integrity';
          abort();
          return;
        }
        const fraction = progress.totalBytesWritten / asset.size;
        if (Number.isFinite(fraction))
          options.onProgress?.(Math.max(0, Math.min(1, fraction)));
      },
    );
    const transfer = task.downloadAsync();
    // A transport that finishes late must not recreate a cancelled partial.
    const cleanupLateTransfer = () => {
      if (controller.signal.aborted) return removeFile(partialUri);
    };
    void transfer.then(cleanupLateTransfer, cleanupLateTransfer);
    const downloaded = await withAbort(
      transfer.catch(() => {
        throw new UpdateFailure('request');
      }),
      controller.signal,
      failure,
    );
    if (downloaded?.status !== 200 || downloaded.uri !== partialUri)
      throw new UpdateFailure('request');
    options.onPhase?.('verifying');
    assertUpdateActive(controller.signal);
    const inspection = await withAbort(
      inspectApk(partialUri),
      controller.signal,
      failure,
    );
    verifyApkInspection(inspection, { size: asset.size, sha256 });
    assertUpdateActive(controller.signal);
    await FileSystem.moveAsync({ from: partialUri, to: finalUri });
    assertUpdateActive(controller.signal);
    options.onProgress?.(1);
    completed = true;
    return finalUri;
  } catch (error) {
    if (controller.signal.aborted) throw failure();
    if (error instanceof UpdateFailure) throw error;
    throw new UpdateFailure('storage');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', stopDownload);
    if (cancelTask) await settleCancellation(cancelTask);
    await removeFile(partialUri);
    activePartials.delete(partialUri);
    if (!completed) await removeFile(finalUri);
  }
}

/** The URI must come from downloadVerifiedApk, after its integrity checks. */
export async function installVerifiedApk(
  uri: string,
  options: {
    signal?: AbortSignal;
    retainOnFailure?: boolean;
    alreadyHandedOff?: boolean;
  } = {},
): Promise<void> {
  let handedOff = false;
  try {
    assertUpdateActive(options.signal);
    const contentUriOperation = FileSystem.getContentUriAsync(uri);
    const contentUri = options.signal
      ? await withAbort(
          contentUriOperation,
          options.signal,
          () => new UpdateFailure('cancelled'),
        )
      : await contentUriOperation;
    assertUpdateActive(options.signal);
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1 | 0x10000000,
        type: 'application/vnd.android.package-archive',
      });
    } catch {
      assertUpdateActive(options.signal);
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.android.package-archive',
        dialogTitle: '安装更新',
      });
    }
    handedOff = true;
  } catch (error) {
    if (error instanceof UpdateFailure) throw error;
    throw new UpdateFailure('storage');
  } finally {
    if (
      !handedOff &&
      !options.alreadyHandedOff &&
      (!options.retainOnFailure || options.signal?.aborted)
    )
      await removeFile(uri);
  }
}

export async function downloadAndInstallVerifiedApk(
  update: ApkUpdate,
  options: ApkDownloadOptions = {},
): Promise<void> {
  const uri = await downloadVerifiedApk(update, options);
  await installVerifiedApk(uri, options);
}
