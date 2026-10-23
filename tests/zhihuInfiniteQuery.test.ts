import { getZhihuNextOffset } from '../src/hooks/useZhihuInfiniteQuery';

test('reads the exact offset parameter instead of another parameter ending in offset', () => {
  expect(
    getZhihuNextOffset({
      paging: {
        next: 'https://api.zhihu.com/list?end_offset=999&moment_start_offset=800&offset=40',
      },
    }),
  ).toBe(40);
  expect(
    getZhihuNextOffset({
      paging: {
        next: '/list?end_offset=999&moment_start_offset=800',
      },
    }),
  ).toBeUndefined();
});

test('stops pagination for invalid, unsafe, missing or terminal offsets', () => {
  for (const offset of [
    '',
    '-1',
    '20x',
    '1.5',
    String(Number.MAX_SAFE_INTEGER + 1),
  ]) {
    expect(
      getZhihuNextOffset({ paging: { next: `/list?offset=${offset}` } }),
    ).toBeUndefined();
  }
  expect(getZhihuNextOffset({ paging: { next: '/list?offset=0' } })).toBe(0);
  expect(
    getZhihuNextOffset({ paging: { next: '/list?offset=40', is_end: true } }),
  ).toBeUndefined();
  expect(getZhihuNextOffset({})).toBeUndefined();
});
