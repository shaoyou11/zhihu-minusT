import apiClient from '../src/api/client';
import { getAllContentCollectionStatus } from '../src/api/zhihu/collection';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: { getState: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

test('includes folders beyond page one and de-duplicates overlapping pages', async () => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({
      data: {
        data: [{ id: '1', is_favorited: false }],
        paging: {
          is_end: false,
          next: '/collections/contents/answer/42?offset=20&limit=20',
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        data: [
          { id: '1', is_favorited: false },
          { id: '2', is_favorited: true },
        ],
        paging: { is_end: true, next: '' },
      },
    });
  expect((await getAllContentCollectionStatus('42', 'answer')).data).toEqual([
    { id: '1', is_favorited: false },
    { id: '2', is_favorited: true },
  ]);
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/collections/contents/answer/42',
    {
      params: { limit: 20, offset: 20 },
    },
  );
});

test('refuses incomplete status when the server repeats a pagination cursor', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    data: {
      data: [{ id: '1', is_favorited: true }],
      paging: { is_end: false, next: '?offset=0' },
    },
  });
  await expect(getAllContentCollectionStatus('42', 'article')).rejects.toThrow(
    '收藏夹分页无效',
  );
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});
