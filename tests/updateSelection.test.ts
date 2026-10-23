import assert from 'node:assert/strict';
import { isVersionNewer, selectAndroidApk } from '../src/utils/updateSelection';

const assets = [
  {
    name: 'SHA256SUMS.txt',
    browser_download_url: 'https://example.com/checksums',
  },
  {
    name: 'zhihu-minus-minus-v0.8.0-arm64-v8a.apk',
    browser_download_url: 'https://example.com/arm64',
  },
  {
    name: 'zhihu-minus-minus-v0.8.0-compat-armeabi-v7a.apk',
    browser_download_url: 'https://example.com/armv7',
  },
  {
    name: 'zhihu-minus-minus-v0.8.0-compat-x86.apk',
    browser_download_url: 'https://example.com/x86',
  },
  {
    name: 'zhihu-minus-minus-v0.8.0-compat-x86_64.apk',
    browser_download_url: 'https://example.com/x86_64',
  },
];
const historicalAssets = assets.map((asset) => ({
  ...asset,
  name: asset.name.replace('-v0.8.0-', '-v0.6.2-preview-'),
}));

test.each([
  ['current', assets],
  ['historical', historicalAssets],
] as const)(
  'selects the first supported ABI from %s APK names',
  (_format, releaseAssets) => {
    assert.equal(
      selectAndroidApk(releaseAssets, ['x86_64', 'x86'])?.browser_download_url,
      'https://example.com/x86_64',
    );
    assert.equal(
      selectAndroidApk(releaseAssets, ['armeabi-v7a'])?.browser_download_url,
      'https://example.com/armv7',
    );
    assert.equal(
      selectAndroidApk(releaseAssets, ['arm64-v8a', 'armeabi-v7a'])
        ?.browser_download_url,
      'https://example.com/arm64',
    );
    assert.equal(
      selectAndroidApk(releaseAssets, ['x86'])?.browser_download_url,
      'https://example.com/x86',
    );
  },
);

test('does not guess when the device ABI or asset name is unknown', () => {
  assert.equal(selectAndroidApk(assets, null), undefined);
  assert.equal(
    selectAndroidApk(
      [
        {
          name: 'some-random-build.apk',
          browser_download_url: 'https://example.com/random',
        },
      ],
      ['arm64-v8a'],
    ),
    undefined,
  );
});

test.each(['universal', 'preview-universal'])(
  'uses a %s APK only as a safe fallback',
  (suffix) => {
    const universal = {
      name: `zhihu-minus-minus-v0.8.0-${suffix}.apk`,
      browser_download_url: 'https://example.com/universal',
    };

    assert.equal(
      selectAndroidApk([...assets, universal], ['riscv64'])
        ?.browser_download_url,
      'https://example.com/universal',
    );
  },
);

test('compares dotted application versions', () => {
  assert.equal(isVersionNewer('0.6.2', '0.6.1'), true);
  assert.equal(isVersionNewer('0.6.2', '0.6.2'), false);
  assert.equal(isVersionNewer('0.6.1', '0.6.2'), false);
});
