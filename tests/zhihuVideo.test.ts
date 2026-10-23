import axios, { CanceledError } from 'axios';
import apiClient from '../src/api/client';
import {
  getZhihuVideo,
  getZhihuVideoPlayback,
  normalizeZhihuVideoDetail,
} from '../src/api/zhihu/video';
import {
  isPlayableVideoUrl,
  parseZhihuVideoId,
  parseZhihuVideoReference,
} from '../src/utils/zhihuVideo';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const lensGet = jest.spyOn(axios, 'get');
const contentGet = jest.mocked(apiClient.get);
const VIDEO_ID = '1234567890123456789';
const HD_URL = 'https://example.com/hd.mp4?version=synthetic&quality=HD';

beforeEach(() => {
  lensGet.mockReset();
  contentGet.mockReset();
});

afterAll(() => {
  lensGet.mockRestore();
});

test('keeps Lens and zvideo identifiers separate without numeric coercion', () => {
  expect(parseZhihuVideoId(VIDEO_ID)).toBe(VIDEO_ID);
  expect(
    parseZhihuVideoReference(`https://www.zhihu.com/video/${VIDEO_ID}`),
  ).toEqual({
    id: VIDEO_ID,
    kind: 'lens',
  });
  expect(
    parseZhihuVideoReference(`https://www.zhihu.com/zvideo/${VIDEO_ID}`),
  ).toEqual({
    id: VIDEO_ID,
    kind: 'zvideo',
  });
  expect(
    parseZhihuVideoReference(`https://api.zhihu.com/zvideos/${VIDEO_ID}`),
  ).toEqual({
    id: VIDEO_ID,
    kind: 'zvideo',
  });
  expect(
    parseZhihuVideoReference(`//lens.zhihu.com/api/v4/videos/${VIDEO_ID}`),
  ).toEqual({
    id: VIDEO_ID,
    kind: 'lens',
  });
  expect(parseZhihuVideoReference(`zhihu://zvideo/${VIDEO_ID}`)).toEqual({
    id: VIDEO_ID,
    kind: 'zvideo',
  });
});

test.each([
  '',
  'not-a-video',
  'https://example.com/video/42',
  'https://www.zhihu.com.example.com/video/42',
  'https://user:password@www.zhihu.com/video/42',
  'https://www.zhihu.com/video/42/answer',
  'javascript:42',
])('rejects unrelated or malformed video references: %s', (value) => {
  expect(parseZhihuVideoId(value)).toBeNull();
});

test('recognizes direct media resources without treating content pages as media', () => {
  expect(isPlayableVideoUrl(HD_URL)).toBe(true);
  expect(
    isPlayableVideoUrl('https://example.com/stream.m3u8?version=synthetic'),
  ).toBe(true);
  expect(isPlayableVideoUrl('https://www.zhihu.com/video/42')).toBe(false);
  expect(
    isPlayableVideoUrl('https://user:password@example.com/video.mp4'),
  ).toBe(false);
  expect(isPlayableVideoUrl('file:///video.mp4')).toBe(false);
  expect(isPlayableVideoUrl('javascript:video.mp4')).toBe(false);
});

test('prefers compatible legacy renditions and preserves runtime URL query parameters', () => {
  const detail = normalizeZhihuVideoDetail(VIDEO_ID, {
    title: null,
    cover_url: 'https://example.com/poster.jpg',
    playlist: {
      LD: { format: 'mp4', play_url: 'https://example.com/sd.mp4' },
      HD: {
        format: 'mp4',
        play_url: HD_URL,
        width: 720,
        height: 1280,
        duration: 8.1,
      },
      SD: { format: 'mp4', play_url: 'https://example.com/sd.mp4' },
    },
    playlist_v2: {
      HD: { format: 'mp4', play_url: 'https://example.com/hevc-hd.mp4' },
      FHD: { format: 'mp4', play_url: 'https://example.com/hevc-fhd.mp4' },
    },
  });

  expect(detail.id).toBe(VIDEO_ID);
  expect(detail.title).toBe('');
  expect(detail.coverUrl).toBe('https://example.com/poster.jpg');
  expect(
    detail.sources.map(({ quality, playlist }) => [quality, playlist]),
  ).toEqual([
    ['HD', 'playlist'],
    ['SD', 'playlist'],
    ['FHD', 'playlist_v2'],
    ['HD', 'playlist_v2'],
  ]);
  expect(detail.sources[0]).toEqual({
    url: HD_URL,
    quality: 'HD',
    format: 'mp4',
    playlist: 'playlist',
    width: 720,
    height: 1280,
    duration: 8.1,
  });
});

test('skips malformed variants and falls back to playlist_v2', () => {
  const detail = normalizeZhihuVideoDetail('42', {
    playlist: {
      HD: { play_url: 'javascript:synthetic', format: 'mp4' },
      SD: { play_url: 'https://example.com/video.flv', format: 'flv' },
      LD: {
        play_url: 'https://user:password@example.com/video.mp4',
        format: 'mp4',
      },
    },
    playlist_v2: {
      HD: {
        play_url: 'https://example.com/video.mp4',
        width: -1,
        height: '720',
        duration: Number.NaN,
      },
      SD: { play_url: 'https://example.com/video.m3u8', format: 'hls' },
    },
  });

  expect(detail.sources).toEqual([
    {
      url: 'https://example.com/video.mp4',
      quality: 'HD',
      format: 'mp4',
      playlist: 'playlist_v2',
    },
    {
      url: 'https://example.com/video.m3u8',
      quality: 'SD',
      format: 'hls',
      playlist: 'playlist_v2',
    },
  ]);
});

test.each([
  null,
  [],
  {},
  { playlist: [] },
  { playlist: { HD: { play_url: 'invalid' } } },
])('reports missing playable sources with fixed feedback', (value) => {
  expect(() => normalizeZhihuVideoDetail('42', value)).toThrow(
    '视频暂无可播放资源',
  );
});

test('fetches public Lens metadata with no account authentication or persistence', async () => {
  const controller = new AbortController();
  lensGet.mockResolvedValueOnce({
    data: { playlist: { HD: { format: 'mp4', play_url: HD_URL } } },
  });

  const detail = await getZhihuVideo(VIDEO_ID, { signal: controller.signal });

  expect(lensGet).toHaveBeenCalledWith(
    `https://lens.zhihu.com/api/v4/videos/${VIDEO_ID}`,
    {
      signal: controller.signal,
      timeout: 10000,
      withCredentials: false,
    },
  );
  expect(contentGet).not.toHaveBeenCalled();
  expect(detail.sources[0].url).toBe(HD_URL);
});

test('rejects invalid IDs before sending a request', async () => {
  await expect(getZhihuVideo('invalid')).rejects.toThrow('视频编号无效');
  expect(lensGet).not.toHaveBeenCalled();
});

test('removes raw network diagnostics from public failures and cancellation', async () => {
  const raw = {
    response: { data: { playlist: { HD: { play_url: HD_URL } } } },
  };
  lensGet.mockRejectedValueOnce(raw);
  await expect(getZhihuVideo('42')).rejects.toEqual(
    new Error('视频信息加载失败，请重试'),
  );

  lensGet.mockRejectedValueOnce(new CanceledError('raw diagnostics'));
  await expect(getZhihuVideo('42')).rejects.toEqual(
    new CanceledError('视频加载已取消'),
  );
});

test('uses playable zvideo metadata directly and keeps page and Lens IDs distinct', async () => {
  contentGet.mockResolvedValueOnce({
    data: {
      id: '42',
      title: '合成视频',
      video: {
        video_id: VIDEO_ID,
        thumbnail: 'https://example.com/zvideo-poster.jpg',
        playlist: {
          ld: { format: 'mp4', url: 'https://example.com/ld.mp4' },
          hd: { format: 'mp4', play_url: HD_URL },
          sd: { format: 'mp4', url: 'https://example.com/sd.mp4' },
        },
      },
    },
  });

  const detail = await getZhihuVideoPlayback('42', 'zvideo');

  expect(contentGet).toHaveBeenCalledWith('/zvideos/42', { signal: undefined });
  expect(lensGet).not.toHaveBeenCalled();
  expect(detail.id).toBe(VIDEO_ID);
  expect(detail.title).toBe('合成视频');
  expect(detail.coverUrl).toBe('https://example.com/zvideo-poster.jpg');
  expect(detail.sources.map(({ quality }) => quality)).toEqual([
    'HD',
    'SD',
    'LD',
  ]);
});

test('resolves zvideo media ID through Lens when embedded playlists are unavailable', async () => {
  contentGet.mockResolvedValueOnce({ data: { video: { video_id: VIDEO_ID } } });
  lensGet.mockResolvedValueOnce({
    data: { playlist: { HD: { format: 'mp4', play_url: HD_URL } } },
  });

  await getZhihuVideoPlayback('42', 'zvideo');

  expect(lensGet).toHaveBeenCalledWith(
    `https://lens.zhihu.com/api/v4/videos/${VIDEO_ID}`,
    {
      signal: undefined,
      timeout: 10000,
      withCredentials: false,
    },
  );
});

test('never falls back to using a zvideo page ID as a Lens ID', async () => {
  contentGet.mockResolvedValueOnce({
    data: { id: '42', video: { video_id: Number.MAX_SAFE_INTEGER + 1 } },
  });

  await expect(getZhihuVideoPlayback('42', 'zvideo')).rejects.toThrow(
    '视频暂无可播放资源',
  );
  expect(lensGet).not.toHaveBeenCalled();
});

test('uses the observed video_id field before a different embedded id', async () => {
  const controller = new AbortController();
  contentGet.mockResolvedValueOnce({
    data: {
      video: {
        id: '84',
        video_id: VIDEO_ID,
        playlist: { HD: { format: 'mp4', play_url: HD_URL } },
      },
    },
  });

  const detail = await getZhihuVideoPlayback('42', 'zvideo', {
    signal: controller.signal,
  });

  expect(detail.id).toBe(VIDEO_ID);
  expect(contentGet).toHaveBeenCalledWith('/zvideos/42', {
    signal: controller.signal,
  });
});

test('supports a legacy embedded id and keeps zvideo failures free of raw diagnostics', async () => {
  contentGet.mockResolvedValueOnce({ data: { video: { id: '84' } } });
  lensGet.mockResolvedValueOnce({
    data: { playlist: { HD: { format: 'mp4', play_url: HD_URL } } },
  });
  expect((await getZhihuVideoPlayback('42', 'zvideo')).id).toBe('84');

  contentGet.mockRejectedValueOnce({
    response: { data: { video: { playlist: { HD: { play_url: HD_URL } } } } },
  });
  await expect(getZhihuVideoPlayback('42', 'zvideo')).rejects.toEqual(
    new Error('视频信息加载失败，请重试'),
  );
});
