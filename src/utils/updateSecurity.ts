import type { ReleaseAsset } from './updateSelection';

export const UPDATE_REPOSITORY = 'shaoyou11/zhihu-minusT';
export const MAX_APK_DOWNLOAD_BYTES = 512 * 1024 * 1024;
export const MAX_CHECKSUM_BYTES = 256 * 1024;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

export interface GithubReleaseAsset extends ReleaseAsset {
  size: number;
  sha256: string | null;
}

export interface GithubRelease {
  tag: string;
  url: string;
  name: string;
  notes: string;
  prerelease: boolean;
  publishedAt: string | null;
  assets: GithubReleaseAsset[];
}

export type UpdateFailureCode =
  | 'metadata'
  | 'url'
  | 'request'
  | 'timeout'
  | 'cancelled'
  | 'integrity'
  | 'storage';

const MESSAGES: Record<UpdateFailureCode, string> = {
  metadata: '版本信息无效，请稍后重试',
  url: '更新地址无效，请从 GitHub 版本页面下载',
  request: '无法连接 GitHub，请稍后重试',
  timeout: '更新请求超时，请重试',
  cancelled: '更新已取消',
  integrity: '安装包校验失败，请重新下载',
  storage: '无法保存或校验安装包，请重试或更新应用',
};

export class UpdateFailure extends Error {
  constructor(public readonly code: UpdateFailureCode) {
    super(MESSAGES[code]);
    this.name = code === 'cancelled' ? 'AbortError' : 'UpdateFailure';
  }
}

export function assertUpdateActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new UpdateFailure('cancelled');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validTag(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RELEASE_TAG.test(value) &&
    value
      .slice(1)
      .split('.')
      .every((part) => Number.isSafeInteger(Number(part)))
  );
}

function trustedGithubUrl(value: unknown, pathname: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === pathname
    );
  } catch {
    return false;
  }
}

export function isTrustedReleaseUrl(
  value: unknown,
  tag: string,
): value is string {
  return (
    validTag(tag) &&
    trustedGithubUrl(
      value,
      `/${UPDATE_REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`,
    )
  );
}

export function isTrustedAssetUrl(
  value: unknown,
  tag: string,
  name: string,
): value is string {
  return (
    validTag(tag) &&
    /^[\w.-]{1,200}$/.test(name) &&
    trustedGithubUrl(
      value,
      `/${UPDATE_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
    )
  );
}

export function normalizeGithubRelease(value: unknown): GithubRelease | null {
  if (
    !isRecord(value) ||
    !validTag(value.tag_name) ||
    !isTrustedReleaseUrl(value.html_url, value.tag_name) ||
    value.draft === true
  )
    return null;
  const tag = value.tag_name;
  const assets = Array.isArray(value.assets) ? value.assets.slice(0, 200) : [];
  const normalizedAssets = assets.flatMap((asset): GithubReleaseAsset[] => {
    if (
      !isRecord(asset) ||
      typeof asset.name !== 'string' ||
      !isTrustedAssetUrl(asset.browser_download_url, tag, asset.name) ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > MAX_APK_DOWNLOAD_BYTES ||
      (asset.state !== undefined && asset.state !== 'uploaded')
    )
      return [];
    let sha256: string | null = null;
    if (asset.digest !== undefined && asset.digest !== null) {
      if (
        typeof asset.digest !== 'string' ||
        !/^sha256:[a-f\d]{64}$/i.test(asset.digest)
      )
        return [];
      sha256 = asset.digest.slice(7).toLowerCase();
    }
    return [
      {
        name: asset.name,
        browser_download_url: asset.browser_download_url,
        size: asset.size,
        sha256,
      },
    ];
  });
  return {
    tag,
    url: value.html_url,
    name:
      typeof value.name === 'string' && value.name.trim()
        ? value.name.slice(0, 256)
        : tag,
    notes: typeof value.body === 'string' ? value.body.slice(0, 64 * 1024) : '',
    prerelease: value.prerelease === true,
    publishedAt:
      typeof value.published_at === 'string' ? value.published_at : null,
    assets: normalizedAssets,
  };
}

export function parseAssetChecksum(text: string, assetName: string): string {
  const hashes = text.split(/\r?\n/).flatMap((line) => {
    const match = /^([a-f\d]{64}) [ *](?:\.\/)?([\w.-]+)$/i.exec(line.trim());
    return match?.[2] === assetName ? [match[1].toLowerCase()] : [];
  });
  if (hashes.length !== 1) throw new UpdateFailure('integrity');
  return hashes[0];
}

export function verifyApkInspection(
  actual: { size: number; sha256: string; isZip: boolean },
  expected: { size: number; sha256: string },
): void {
  if (
    !actual.isZip ||
    actual.size !== expected.size ||
    !/^[a-f\d]{64}$/i.test(actual.sha256) ||
    actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()
  )
    throw new UpdateFailure('integrity');
}
