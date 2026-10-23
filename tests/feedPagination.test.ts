import {
  flattenDailyPages,
  getDailyNextPageParam,
} from '../src/utils/dailyList';
import {
  getFeedNextUrl,
  getFeedRequestUrl,
  getNextUnvisitedFeedPage,
} from '../src/utils/feedPagination';

test('refresh keeps the virtual local entry resolvable while marking HTTP feed refreshes', () => {
  expect(
    getFeedRequestUrl('zhihu://local-feed', 'zhihu://local-feed', true, 123),
  ).toBe('zhihu://local-feed');
  const initial =
    'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10';
  expect(getFeedRequestUrl(initial, initial, true, 123)).toBe(
    `${initial}&action=up&t=123`,
  );
  const next = `${initial}&action=down&offset=10`;
  expect(getFeedRequestUrl(next, initial, true, 123)).toBe(next);
  expect(getFeedRequestUrl(initial, initial, false, 123)).toBe(initial);
});

test('feed pagination honors terminal pages and prevents repeated cursor requests', () => {
  expect(
    getFeedNextUrl({
      is_end: true,
      next: 'https://example.test/feed?offset=20',
    }),
  ).toBeNull();
  const next = getFeedNextUrl({
    is_end: false,
    next: 'http://example.test/feed?offset=20',
  });
  expect(next).toBe('https://example.test/feed?offset=20');
  expect(getNextUnvisitedFeedPage(next, ['initial'])).toBe(next);
  expect(getNextUnvisitedFeedPage(next, ['initial', next])).toBeUndefined();
  expect(getNextUnvisitedFeedPage(null, ['initial'])).toBeUndefined();
});

test('daily pagination stops at empty, malformed or already visited dates', () => {
  const story = { id: 1, title: '合成日报' };
  expect(
    getDailyNextPageParam({ date: '20261002', stories: [story] }, ['']),
  ).toBe('20261002');
  expect(
    getDailyNextPageParam({ date: '20261002', stories: [] }, ['']),
  ).toBeUndefined();
  expect(
    getDailyNextPageParam({ date: '20261002', stories: [story] }, [
      '',
      '20261002',
    ]),
  ).toBeUndefined();
  expect(
    getDailyNextPageParam({ date: 'invalid', stories: [story] }, ['']),
  ).toBeUndefined();
});

test('daily overlaps use stable identities and empty pages do not create date-only content', () => {
  const first = { id: 1, title: '合成日报一' };
  const second = { id: 2, title: '合成日报二' };
  expect(
    flattenDailyPages([
      { date: '20261002', stories: [first] },
      { date: '20261002', stories: [first, second] },
      { date: '20261001', stories: [] },
    ]),
  ).toEqual([
    { type: 'date', date: '20261002' },
    { type: 'story', data: first },
    { type: 'story', data: second },
  ]);
});
