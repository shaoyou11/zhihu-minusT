import type { ReadHistoryDataItem } from '../src/api/zhihu/history';
import {
  getReadHistoryKey,
  getReadHistoryRoute,
  getSelectedReadHistoryPairs,
} from '../src/utils/readHistory';

function historyItem(type: string, token: string): ReadHistoryDataItem {
  return {
    id: `${type}-${token}`,
    data: {
      header: { title: '合成浏览记录' },
      content: { summary: '' },
      matrix: [],
      extra: { content_type: type, content_token: token, read_time: 1 },
    },
  };
}

test('deletion preserves complete profile tokens and removes duplicate page entries', () => {
  const profile = historyItem('profile', 'synthetic-user-token');
  const answer = historyItem('answer', '42');
  expect(
    getSelectedReadHistoryPairs(
      [profile, answer, profile],
      new Set([getReadHistoryKey(profile)]),
    ),
  ).toEqual([
    { content_type: 'profile', content_token: 'synthetic-user-token' },
  ]);
});

test('history routes normalize video and profile types and reject unknown types', () => {
  expect(getReadHistoryRoute(historyItem('zvideo', '42'))).toBe('/video/42');
  expect(getReadHistoryRoute(historyItem('profile', 'synthetic-user'))).toBe(
    '/user/synthetic-user',
  );
  expect(getReadHistoryRoute(historyItem('answer', '42'))).toBe('/answer/42');
  expect(getReadHistoryRoute(historyItem('unsupported', '42'))).toBeNull();
});

test('selection distinguishes content types and ignores obsolete or unsupported records', () => {
  const answer = historyItem('answer', '42');
  const article = historyItem('article', '42');
  const unknown = historyItem('unsupported', '42');
  expect(getReadHistoryKey(answer)).not.toBe(getReadHistoryKey(article));
  expect(
    getSelectedReadHistoryPairs(
      [article, unknown],
      new Set([getReadHistoryKey(answer), getReadHistoryKey(unknown)]),
    ),
  ).toEqual([]);
});
