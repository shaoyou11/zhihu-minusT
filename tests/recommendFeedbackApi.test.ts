import apiClient from '../src/api/client';
import { markRecommendationUninterested } from '../src/api/zhihu/feed';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock('../src/store/useAuthStore', () => ({ useAuthStore: {} }));
jest.mock('../src/store/useSettingsStore', () => ({ useSettingsStore: {} }));

beforeEach(() => jest.clearAllMocks());

test.each([
  ['answers', '1'],
  ['articles', '2'],
] as const)(
  'sends %s feedback using the captured form contract',
  async (type, code) => {
    await markRecommendationUninterested({ id: 'synthetic-token', type });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/zrec-feedback/uninterested',
      `scene_code=RECOMMEND&content_type=${code}&content_token=synthetic-token&uninterested_type=less_similar&feed_deliver_type=Normal&desktop=true`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      },
    );
  },
);
