import { AxiosHeaders, type AxiosResponse } from 'axios';
import apiClient from '../src/api/client';
import {
  reactAnswerSegment,
  unreactAnswerSegment,
} from '../src/api/zhihu/answer';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), delete: jest.fn() },
}));

const post = jest.mocked(apiClient.post);
const remove = jest.mocked(apiClient.delete);

function response(data: unknown, status = 200): AxiosResponse<unknown> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue(response({}));
  remove.mockResolvedValue(response({}));
});

describe('answer segment reaction API adapter', () => {
  it('keeps the exact selected content and UTF-16 source offsets in a legacy string-ID call', async () => {
    await reactAnswerSegment('42', '200', '乙😀', 'p-one', 1, 4);
    expect(post).toHaveBeenCalledWith('/reaction/answers/42/segment_reaction', {
      seg_id: '200',
      content: '乙😀',
      position: {
        start: { paragraph_id: 'p-one', offset: 1 },
        end: { paragraph_id: 'p-one', offset: 4 },
      },
    });
  });

  it.each([['200', '300'] as const, '200, 300'])(
    'posts every ID in a group as the protocol comma-separated string (%j)',
    async (ids) => {
      await reactAnswerSegment(42, ids, '片段', 'p-one', 0, 2);
      expect(post.mock.calls[0]?.[1]).toMatchObject({ seg_id: '200,300' });
    },
  );

  it('deletes every returned reaction ID and escapes the answer path component', async () => {
    await unreactAnswerSegment('answer/one?', ['new-1', 'new-2']);
    expect(remove).toHaveBeenCalledWith(
      '/reaction/answers/answer%2Fone%3F/segment_reaction',
      { data: { seg_ids: 'new-1,new-2' } },
    );
    await reactAnswerSegment('answer/one?', '200', '片段', 'p-one', 0, 2);
    expect(post.mock.calls[0]?.[0]).toBe(
      '/reaction/answers/answer%2Fone%3F/segment_reaction',
    );
  });

  it('extracts the replacement IDs from payload.segId and projects only known response fields', async () => {
    post.mockResolvedValue(
      response({
        success: true,
        status: 0,
        message: 'success',
        payload: { segId: 'new-1,new-2', unrelated: 'discarded' },
        unrelated: { config: 'discarded' },
      }),
    );
    expect(
      await reactAnswerSegment('42', 'master-1', '片段', 'p-one', 0, 2),
    ).toEqual({
      success: true,
      status: 0,
      message: 'success',
      segmentIds: ['new-1', 'new-2'],
    });
  });

  it('retains a safe numeric returned ID and removes duplicate returned IDs', async () => {
    post.mockResolvedValue(response({ payload: { segId: 200 } }));
    expect(
      await reactAnswerSegment('42', '100', '片段', 'p-one', 0, 2),
    ).toEqual({ segmentIds: ['200'] });
    post.mockResolvedValue(response({ payload: { segId: '200, 300,200' } }));
    expect(
      await reactAnswerSegment('42', '100', '片段', 'p-one', 0, 2),
    ).toEqual({ segmentIds: ['200', '300'] });
  });

  it.each([
    undefined,
    '',
    [],
    { payload: null },
    { payload: [] },
    { payload: { segId: null } },
    { payload: { segId: ['200'] } },
    { payload: { segId: '200,' } },
    { payload: { segId: 'https://example.com' } },
    { payload: { segId: Number.MAX_SAFE_INTEGER + 1 } },
    { payload: { segId: -1 } },
  ])(
    'does not manufacture IDs for missing or malformed response data (%j)',
    async (data) => {
      post.mockResolvedValue(response(data));
      expect(
        await reactAnswerSegment('42', '200', '片段', 'p-one', 0, 2),
      ).toEqual({});
    },
  );

  it('handles a successful empty 204 response without inventing an ID', async () => {
    post.mockResolvedValue(response(undefined, 204));
    remove.mockResolvedValue(response(undefined, 204));
    expect(
      await reactAnswerSegment('42', '200', '片段', 'p-one', 0, 2),
    ).toEqual({});
    expect(await unreactAnswerSegment('42', ['200', '300'])).toEqual({});
  });

  it.each(['', [], [''], '200,', new Array<string>(2)])(
    'rejects missing group IDs before either API request (%j)',
    async (ids) => {
      await expect(
        reactAnswerSegment('42', ids, '片段', 'p-one', 0, 2),
      ).rejects.toThrow('段落缺少有效的 seg_id');
      await expect(unreactAnswerSegment('42', ids)).rejects.toThrow(
        '段落缺少有效的 seg_id',
      );
      expect(post).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('propagates request failure without converting it into a successful local toggle', async () => {
    const error = new Error('request failed');
    post.mockRejectedValue(error);
    await expect(
      reactAnswerSegment('42', '200', '片段', 'p-one', 0, 2),
    ).rejects.toBe(error);
  });
});
