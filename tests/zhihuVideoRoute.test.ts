import {
  getDirectZhihuVideoUrl,
  getZhihuVideoRoute,
} from '../src/utils/zhihuVideoRoute';

test('Lens identity takes priority over a different zvideo page and expiring media resource', () => {
  expect(
    getZhihuVideoRoute({
      lensId: '1234567890123456789',
      videoId: '202',
      url: 'https://www.zhihu.com/zvideo/202',
      resourceUrl: 'https://example.com/synthetic.mp4',
    }),
  ).toBe('zhihu--:///video/1234567890123456789?source=lens');
});

test.each([
  ['https://www.zhihu.com/video/101', 'lens'],
  ['/video/101', 'lens'],
  ['https://lens.zhihu.com/api/v4/videos/101', 'lens'],
  ['https://www.zhihu.com/zvideo/101', 'zvideo'],
  ['zhihu://videos/101', 'lens'],
  ['https://api.zhihu.com/zvideos/101', 'zvideo'],
])(
  'routes a recognized video URL %s using its actual identity type',
  (url, source) => {
    expect(getZhihuVideoRoute({ url })).toBe(
      `zhihu--:///video/101?source=${source}`,
    );
  },
);

test('preserves direct media query parameters and encodes its title once', () => {
  const uri = 'https://example.com/synthetic.m3u8?quality=hd&part=1';
  const route = getZhihuVideoRoute({ resourceUrl: uri, title: '视频 & 标题' });
  if (!route) throw new Error('Expected a direct video playback route');
  const url = new URL(route);
  expect(url.pathname).toBe('/video/direct');
  expect(url.searchParams.get('uri')).toBe(uri);
  expect(url.searchParams.get('title')).toBe('视频 & 标题');
  expect(url.searchParams.get('source')).toBe('direct');
});

test.each([
  'https://example.com/video-page',
  'javascript:alert(1)',
  'file:///video.mp4',
  'https://user:password@example.com/video.mp4',
  'https://www.zhihu.com.evil.example/video/101',
  'https://www.zhihu.com/video/101suffix',
  'https://www.zhihu.com/video/101/other',
])('rejects a page or unsafe playback resource %s', (url) => {
  expect(getDirectZhihuVideoUrl(url)).toBeUndefined();
  expect(getZhihuVideoRoute({ url })).toBeUndefined();
});

test('does not treat a malformed Lens identity as a playback ID', () => {
  expect(getZhihuVideoRoute({ lensId: 'bad-id' })).toBeUndefined();
  expect(getZhihuVideoRoute({ lensId: 'bad-id', videoId: '202' })).toBe(
    'zhihu--:///video/202?source=zvideo',
  );
});
