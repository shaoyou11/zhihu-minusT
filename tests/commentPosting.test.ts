import apiClient from '../src/api/client';
import {
  createArticleComment,
  createCommentV5,
  createPinComment,
} from '../src/api/zhihu/comment';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const post = jest.mocked(apiClient.post);
const content =
  '<p>合成评论 &amp; 内容</p><figure><img src="https://example.invalid/image.png" /></figure>';
const resources = [
  { type: 'articles', create: createArticleComment },
  { type: 'pins', create: createPinComment },
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue({ data: { id: '500', content } });
});

test.each(resources)(
  '$type roots use the V5 thread endpoint and preserve text and image HTML',
  async ({ type, create }) => {
    await expect(create('42', content)).resolves.toEqual({
      id: '500',
      content,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(`/comment_v5/${type}/42/comment`, {
      content,
      type: 'comment',
    });
  },
);

test.each(resources)(
  '$type replies stay in the same resource thread with their selected reply target',
  async ({ type }) => {
    await createCommentV5(type, '42', content, '500');
    expect(post).toHaveBeenCalledWith(`/comment_v5/${type}/42/comment`, {
      content,
      type: 'comment',
      reply_comment_id: '500',
    });
  },
);

test.each(resources)(
  '$type posting failures propagate without retrying a second write endpoint',
  async ({ create }) => {
    const failure = new Error('synthetic network failure');
    post.mockRejectedValueOnce(failure);
    await expect(create('42', content)).rejects.toBe(failure);
    expect(post).toHaveBeenCalledTimes(1);
  },
);
