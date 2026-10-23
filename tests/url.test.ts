import { redirectSystemPath } from '../src/app/+native-intent';
import {
  getSafeExternalUrl,
  parseRichContentDevelopmentUrl,
  parseZhihuUrl,
  sanitizeNavigationUrlForLog,
} from '../src/utils/url';

test('login navigation logs omit credentials, query and fragment', () => {
  expect(
    sanitizeNavigationUrlForLog(
      'https://user:password@www.zhihu.com/signin?ticket=synthetic#token=synthetic',
    ),
  ).toBe('https://www.zhihu.com/signin');
  expect(sanitizeNavigationUrlForLog('broken#token=synthetic')).toBe(
    '[invalid-url]',
  );
  expect(sanitizeNavigationUrlForLog('zhihu://signin#token=synthetic')).toBe(
    '[non-web-url]',
  );
});

test.each([true, false])(
  'routes links with long malformed queries on initial=%s',
  (initial) => {
    const malformedQuery = '%EA'.repeat(2048);

    for (const path of [
      'https://www.zhihu.com/question/42/answer/84',
      'zhihu://question/42/answer/84',
      '/question/42/answer/84',
    ]) {
      expect(
        redirectSystemPath({
          path: `${path}?unused=${malformedQuery}&broken=%G&trailing=%`,
          initial,
        }),
      ).toBe('/answer/84');
    }
  },
);

test.each([
  ['https://example.com/article?q=1', 'https://example.com/article?q=1'],
  ['http://example.com', 'http://example.com/'],
  ['javascript:alert(1)', null],
  ['file:///private/synthetic', null],
  ['intent://synthetic#Intent;end', null],
  ['https://user:password@example.com', null],
])('restricts external content links to web URLs (%s)', (input, expected) => {
  expect(getSafeExternalUrl(input)).toBe(expected);
});

test.each([
  ['https://www.zhihu.com/question/42/answer/84?source=test', '/answer/84'],
  ['https://zhuanlan.zhihu.com/p/42#paragraph', '/article/42'],
  ['zhihu://question/42', '/question/42'],
  ['zhihu--:///people/synthetic/followers', '/user/synthetic/followers'],
  ['https://www.zhihu.com.evil.example/question/42', null],
  ['https://example.com/question/42', null],
  ['javascript://question/42', null],
])('normalizes supported links (%s)', (input, expected) => {
  expect(parseZhihuUrl(input)).toBe(expected);
});

test.each([
  ['https://www.zhihu.com/video/42', '/video/42?source=lens'],
  ['https://www.zhihu.com/zvideo/84', '/video/84?source=zvideo'],
  ['zhihu://video/42', '/video/42?source=lens'],
  ['zhihu://zvideo/84', '/video/84?source=zvideo'],
  ['zhihu--:///video/84', '/video/84?source=zvideo'],
  ['/video/84', '/video/84?source=zvideo'],
  ['zhihu--:///video/42?source=lens&ignored=1', '/video/42?source=lens'],
  [
    'zhihu--:///video/84?source=zvideo&title=%E8%A7%86%E9%A2%91',
    '/video/84?source=zvideo&title=%E8%A7%86%E9%A2%91',
  ],
])('keeps Lens and zvideo identities separate (%s)', (input, expected) => {
  expect(parseZhihuUrl(input)).toBe(expected);
  expect(redirectSystemPath({ path: input, initial: true })).toBe(expected);
  expect(redirectSystemPath({ path: input, initial: false })).toBe(expected);
});

test('direct playback routes retain only safe media resources', () => {
  const media = 'https://example.invalid/video.mp4?version=synthetic';
  const path = `/video/direct?source=direct&uri=${encodeURIComponent(media)}`;
  expect(parseZhihuUrl(`zhihu--://${path}&ignored=1`)).toBe(path);
  expect(parseZhihuUrl(path)).toBe(path);
  expect(
    parseZhihuUrl(
      'zhihu--:///video/direct?source=direct&uri=file%3A%2F%2F%2Fprivate%2Fvideo.mp4',
    ),
  ).toBeNull();
  expect(
    parseZhihuUrl(
      'zhihu--:///video/direct?source=direct&uri=https%3A%2F%2Fexample.invalid%2Fpage',
    ),
  ).toBeNull();
  expect(parseZhihuUrl(`https://www.zhihu.com${path}`)).toBeNull();
});

test('only the dev parser accepts the isolated native validation route', () => {
  expect(
    parseRichContentDevelopmentUrl(
      'zhihu--:///dev/native-validation?ignored=1',
    ),
  ).toBe('/dev/native-validation');
  expect(parseZhihuUrl('zhihu--:///dev/native-validation')).toBeNull();
  expect(
    parseRichContentDevelopmentUrl('https://example.com/dev/native-validation'),
  ).toBeNull();
});
