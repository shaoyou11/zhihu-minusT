export const ANDROID_ABIS = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
] as const;

export type AndroidAbi = (typeof ANDROID_ABIS)[number];

export interface ReleaseAsset {
  browser_download_url: string;
  name: string;
}

const KNOWN_ABIS = new Set<string>(ANDROID_ABIS);
const ABI_APK_SUFFIX =
  /-(?:preview-)?(?:compat-)?(arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/i;
const UNIVERSAL_APK_SUFFIX = /-(?:preview-)?universal\.apk$/i;

function normalizeAbi(value: string): AndroidAbi | null {
  const normalized = value.trim().toLowerCase();
  return KNOWN_ABIS.has(normalized) ? (normalized as AndroidAbi) : null;
}

function getAssetAbi(name: string): AndroidAbi | 'universal' | null {
  if (UNIVERSAL_APK_SUFFIX.test(name)) return 'universal';
  const match = name.match(ABI_APK_SUFFIX);
  return match ? normalizeAbi(match[1]) : null;
}

export function selectAndroidApk<T extends ReleaseAsset>(
  assets: readonly T[],
  supportedCpuArchitectures: readonly string[] | null | undefined,
): T | undefined {
  const recognizedAssets = assets.flatMap((asset) => {
    const abi = getAssetAbi(asset.name);
    return abi ? [{ abi, asset }] : [];
  });

  for (const architecture of supportedCpuArchitectures ?? []) {
    const abi = normalizeAbi(architecture);
    if (!abi) continue;
    const exactMatch = recognizedAssets.find((item) => item.abi === abi);
    if (exactMatch) return exactMatch.asset;
  }

  return recognizedAssets.find((item) => item.abi === 'universal')?.asset;
}

export function isVersionNewer(latest: string, current: string): boolean {
  if (![latest, current].every((value) => /^\d+(?:\.\d+){0,3}$/.test(value)))
    return false;
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  if (![...latestParts, ...currentParts].every(Number.isSafeInteger))
    return false;

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}
