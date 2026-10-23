import {
  fetchUpdateText,
  getGithubReleaseHistory,
  getLatestGithubRelease,
  UPDATE_REQUEST_TIMEOUT_MS,
} from '../src/api/githubReleases';
import {
  isTrustedAssetUrl,
  isTrustedReleaseUrl,
  normalizeGithubRelease,
  parseAssetChecksum,
} from '../src/utils/updateSecurity';
import { isVersionNewer } from '../src/utils/updateSelection';

const tag = 'v0.8.0';
const name = 'zhihu-minus-minus-v0.8.0-arm64-v8a.apk';
const releaseUrl = `https://github.com/shaoyou11/zhihu-minusT/releases/tag/${tag}`;
const assetUrl = `https://github.com/shaoyou11/zhihu-minusT/releases/download/${tag}/${name}`;
const apiUrl =
  'https://api.github.com/repos/shaoyou11/zhihu-minusT/releases/latest';
const sha = 'a'.repeat(64);
const originalFetch = global.fetch;
const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

function release() {
  return {
    tag_name: tag,
    html_url: releaseUrl,
    body: 'Synthetic notes',
    assets: [
      {
        name,
        browser_download_url: assetUrl,
        size: 64,
        digest: `sha256:${sha}`,
      },
    ],
  };
}

function response(text: string, url = apiUrl): Response {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: () => null },
    text: async () => text,
  } as unknown as Response;
}

beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

test.each([name, name.replace('-arm64-', '-preview-arm64-')])(
  'normalizes %s and preserves the authenticated GitHub size and SHA-256',
  (assetName) => {
    const browserDownloadUrl = assetUrl.replace(name, assetName);
    expect(
      normalizeGithubRelease({
        ...release(),
        assets: [
          {
            ...release().assets[0],
            name: assetName,
            browser_download_url: browserDownloadUrl,
          },
        ],
      })?.assets[0],
    ).toEqual({
      name: assetName,
      browser_download_url: browserDownloadUrl,
      size: 64,
      sha256: sha,
    });
  },
);

test.each([
  'http://github.com/shaoyou11/zhihu-minusT/releases/tag/v0.8.0',
  'https://github.com.evil.invalid/shaoyou11/zhihu-minusT/releases/tag/v0.8.0',
  'https://synthetic@github.com/shaoyou11/zhihu-minusT/releases/tag/v0.8.0',
  'https://github.com/other/repo/releases/tag/v0.8.0',
  `${releaseUrl}?synthetic=private`,
])('rejects a release URL outside the exact public repository: %s', (url) => {
  expect(isTrustedReleaseUrl(url, tag)).toBe(false);
  expect(normalizeGithubRelease({ ...release(), html_url: url })).toBeNull();
});

test('drops invalid assets and refuses traversal, cross-release URLs or unsafe versions', () => {
  expect(isTrustedAssetUrl(assetUrl, tag, name)).toBe(true);
  expect(isTrustedAssetUrl(assetUrl.replace(tag, 'v0.9.0'), tag, name)).toBe(
    false,
  );
  expect(isTrustedAssetUrl(assetUrl, tag, '../installer.apk')).toBe(false);
  expect(
    normalizeGithubRelease({
      ...release(),
      assets: [
        { ...release().assets[0], size: -1 },
        { ...release().assets[0], digest: 'sha256:invalid' },
      ],
    })?.assets,
  ).toEqual([]);
  expect(
    normalizeGithubRelease({ ...release(), tag_name: 'vNaN.8.0' }),
  ).toBeNull();
  expect(isVersionNewer('NaN.8.0', '0.7.0')).toBe(false);
  expect(isVersionNewer('999999999999999999999.8.0', '0.7.0')).toBe(false);
});

test('accepts workflow sha256sum filename syntax and rejects missing or duplicate digests', () => {
  expect(parseAssetChecksum(`${sha}  ./${name}\n`, name)).toBe(sha);
  expect(parseAssetChecksum(`${sha} *${name}\n`, name)).toBe(sha);
  expect(() => parseAssetChecksum(`${sha}  another.apk`, name)).toThrow();
  expect(() =>
    parseAssetChecksum(`${sha}  ${name}\n${sha}  ${name}`, name),
  ).toThrow();
});

test('fetches unknown JSON through schema validation and rejects malformed release/history responses', async () => {
  fetchMock.mockResolvedValueOnce(response(JSON.stringify(release())));
  expect((await getLatestGithubRelease()).tag).toBe(tag);
  fetchMock.mockResolvedValueOnce(response('[]'));
  await expect(getLatestGithubRelease()).rejects.toMatchObject({
    code: 'metadata',
  });
  fetchMock.mockResolvedValueOnce(response('{}'));
  await expect(getGithubReleaseHistory()).rejects.toMatchObject({
    code: 'metadata',
  });
});

test('refuses untrusted initial URLs before a request and untrusted redirect hosts', async () => {
  await expect(
    fetchUpdateText('https://evil.invalid/private'),
  ).rejects.toMatchObject({ code: 'url' });
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(
    response('{}', 'https://evil.invalid/private'),
  );
  await expect(fetchUpdateText(apiUrl)).rejects.toMatchObject({ code: 'url' });
});

test('supports official release CDN redirects for checksum assets', async () => {
  const checksumUrl = assetUrl.replace(name, 'SHA256SUMS.txt');
  fetchMock.mockResolvedValueOnce(
    response(
      `${sha}  ${name}`,
      'https://release-assets.githubusercontent.com/synthetic?signature=synthetic',
    ),
  );
  expect(await fetchUpdateText(checksumUrl, { asset: true })).toBe(
    `${sha}  ${name}`,
  );
});

test('rejects excessive response lengths before accepting metadata', async () => {
  fetchMock.mockResolvedValueOnce(response('x'.repeat(101)));
  await expect(fetchUpdateText(apiUrl, { limit: 100 })).rejects.toMatchObject({
    code: 'metadata',
  });
});

test('cancels a request even if the transport does not honor its signal', async () => {
  fetchMock.mockImplementation(() => new Promise(() => undefined));
  const controller = new AbortController();
  const pending = fetchUpdateText(apiUrl, { signal: controller.signal });
  const failed = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  controller.abort();
  await failed;
});

test('bounds a stalled update request with a timeout', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation(() => new Promise(() => undefined));
  const pending = fetchUpdateText(apiUrl);
  const failed = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(UPDATE_REQUEST_TIMEOUT_MS);
  await failed;
});
