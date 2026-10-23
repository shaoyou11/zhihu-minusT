import {
  assertUpdateActive,
  type GithubRelease,
  isTrustedAssetUrl,
  normalizeGithubRelease,
  UPDATE_REPOSITORY,
  UpdateFailure,
} from '@/utils/updateSecurity';

const BASE_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases`;
export const UPDATE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RELEASE_RESPONSE_LENGTH = 2 * 1024 * 1024;

/** Bounded requests; only GitHub's own release CDN may satisfy asset redirects. */
export async function fetchUpdateText(
  url: string,
  options: { signal?: AbortSignal; limit?: number; asset?: boolean } = {},
): Promise<string> {
  assertUpdateActive(options.signal);
  try {
    const initialUrl = new URL(url);
    if (options.asset) {
      const segments = initialUrl.pathname.split('/');
      if (
        segments.length !== 7 ||
        !isTrustedAssetUrl(
          url,
          decodeURIComponent(segments[5]),
          decodeURIComponent(segments[6]),
        )
      )
        throw new UpdateFailure('url');
    } else if (
      initialUrl.protocol !== 'https:' ||
      initialUrl.host !== 'api.github.com' ||
      initialUrl.username ||
      initialUrl.password ||
      initialUrl.hash ||
      ![
        new URL(BASE_URL).pathname,
        `${new URL(BASE_URL).pathname}/latest`,
      ].includes(initialUrl.pathname)
    )
      throw new UpdateFailure('url');
  } catch {
    throw new UpdateFailure('url');
  }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, UPDATE_REQUEST_TIMEOUT_MS);
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () =>
      reject(new UpdateFailure(timedOut ? 'timeout' : 'cancelled'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    const response = await Promise.race([
      fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: options.asset ? 'text/plain' : 'application/vnd.github+json',
        },
      }),
      aborted,
    ]);
    if (!response.ok) throw new UpdateFailure('request');
    if (response.url) {
      const finalUrl = new URL(response.url);
      const allowed = options.asset
        ? [
            'github.com',
            'release-assets.githubusercontent.com',
            'objects.githubusercontent.com',
            'github-releases.githubusercontent.com',
          ]
        : ['api.github.com'];
      if (
        finalUrl.protocol !== 'https:' ||
        !allowed.includes(finalUrl.hostname) ||
        finalUrl.username ||
        finalUrl.password ||
        finalUrl.port
      )
        throw new UpdateFailure('url');
    }
    const limit = options.limit ?? MAX_RELEASE_RESPONSE_LENGTH;
    const contentLength = response.headers.get('content-length');
    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)
    )
      throw new UpdateFailure('metadata');
    const text = await Promise.race([response.text(), aborted]);
    if (text.length > limit) throw new UpdateFailure('metadata');
    assertUpdateActive(controller.signal);
    return text;
  } catch (error) {
    if (controller.signal.aborted)
      throw new UpdateFailure(timedOut ? 'timeout' : 'cancelled');
    if (error instanceof UpdateFailure) throw error;
    throw new UpdateFailure('request');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
    if (rejectAbort)
      controller.signal.removeEventListener('abort', rejectAbort);
  }
}

function decodeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UpdateFailure('metadata');
  }
}

export async function getLatestGithubRelease(options?: {
  signal?: AbortSignal;
}): Promise<GithubRelease> {
  const release = normalizeGithubRelease(
    decodeJson(await fetchUpdateText(`${BASE_URL}/latest`, options)),
  );
  if (!release) throw new UpdateFailure('metadata');
  return release;
}

export async function getGithubReleaseHistory(options?: {
  signal?: AbortSignal;
}): Promise<GithubRelease[]> {
  const releases: GithubRelease[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = decodeJson(
      await fetchUpdateText(`${BASE_URL}?per_page=100&page=${page}`, options),
    );
    if (!Array.isArray(data)) throw new UpdateFailure('metadata');
    releases.push(
      ...data
        .map(normalizeGithubRelease)
        .filter((value): value is GithubRelease => value !== null),
    );
    if (data.length < 100) return releases;
  }
  throw new UpdateFailure('metadata');
}
