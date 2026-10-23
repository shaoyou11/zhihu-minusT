import { AxiosHeaders, type AxiosResponse } from 'axios';
import apiClient from '../src/api/client';
import { FEED_URLS, getFeed } from '../src/api/zhihu/feed';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ cookies: 'synthetic-auth' }) },
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ updateSettings: jest.fn() }),
  },
}));

function response(data: unknown): AxiosResponse<unknown> {
  return {
    config: { headers: new AxiosHeaders() },
    data,
    headers: {},
    status: 200,
    statusText: 'OK',
  };
}

const get = jest.mocked(apiClient.get);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

test('selects the local section even when an unrelated section appears first', async () => {
  const updateSettings = jest.fn();
  jest.spyOn(useSettingsStore, 'getState').mockReturnValue({
    updateSettings,
  } as unknown as ReturnType<typeof useSettingsStore.getState>);
  get
    .mockResolvedValueOnce(
      response({
        data: [
          { section_id: 'ordinary', section_name: '普通频道' },
          { section_id: 'local', section_name: '同城 · 测试城市' },
        ],
      }),
    )
    .mockResolvedValueOnce(response({ data: [], paging: { is_end: true } }));
  await getFeed('zhihu://local-feed');
  expect(get.mock.calls[1]?.[0]).toBe(
    'https://api.zhihu.com/feed-root/section/local?channelStyle=0',
  );
  expect(updateSettings).toHaveBeenCalledWith({
    localCityName: '同城 · 测试城市',
  });
});

test('falls back to recommendation when no valid local section exists', async () => {
  get
    .mockResolvedValueOnce(
      response({
        data: [
          { section_id: 'ordinary', section_name: '普通频道' },
          { section_id: '', section_name: '同城' },
        ],
      }),
    )
    .mockResolvedValueOnce(response({ data: [], paging: { is_end: true } }));
  await getFeed('zhihu://local-feed');
  expect(get.mock.calls[1]?.[0]).toBe(FEED_URLS.recommend);
});
