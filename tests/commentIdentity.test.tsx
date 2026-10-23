import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import apiClient from '../src/api/client';
import {
  type CommentItem,
  getAnswerCommentsV5,
  getChildCommentsV5,
  getComment,
} from '../src/api/zhihu/comment';
import { CommentIdentityBadges } from '../src/components/CommentIdentityBadges';
import { getCommentIdentityBadges } from '../src/utils/commentIdentity';
import {
  parseParentComment,
  serializeParentComment,
} from '../src/utils/commentRoute';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  useThemeColor: () => '#123456',
}));

const member = {
  id: 'synthetic-author',
  url_token: 'synthetic-author',
  name: '合成用户',
  avatar_url: '',
  is_following: true,
};
const comment: CommentItem = {
  id: 'synthetic-comment',
  type: 'comment',
  content: '合成评论',
  created_time: 1,
  is_author: true,
  author: { member },
  author_tag: [
    { type: 'author', text: '作者' },
    { type: 'following', text: '我关注的人' },
    { type: 'identity', text: '提问者' },
  ],
  comment_tag: [
    { type: 'ip_info', text: '合成属地' },
    { type: 'hot', text: '热评' },
  ],
  child_comments: [],
  child_comment_count: 0,
};

beforeEach(() => jest.clearAllMocks());

test('author and follow identities include server labels once and keep IP location separate', () => {
  expect(getCommentIdentityBadges(comment)).toEqual([
    '作者',
    '我关注的人',
    '提问者',
    '热评',
  ]);
  expect(
    getCommentIdentityBadges({
      ...comment,
      is_author: false,
      author: { member: { ...member, is_following: false } },
      author_tag: [],
      comment_tag: [],
    }),
  ).toEqual([]);
});

test.each([
  ['roots', getAnswerCommentsV5],
  ['replies', getChildCommentsV5],
] as const)(
  '%s normalize V5 tags recursively and skip malformed remote labels',
  async (_, load) => {
    const raw = {
      ...comment,
      author: member,
      author_tag: [
        null,
        { type: 'identity', text: ' 提问者 ' },
        { type: 'invalid', text: 1 },
        { type: 1, text: 'invalid' },
        { type: 'empty', text: ' ' },
      ],
      child_comments: [{ ...comment, author: member }],
    };
    jest.mocked(apiClient.get).mockResolvedValue({
      data: { data: [raw] },
    });
    const result = await load('synthetic-thread');
    expect(getCommentIdentityBadges(result.data[0])).toEqual([
      '作者',
      '我关注的人',
      '提问者',
      '热评',
    ]);
    expect(result.data[0].address_text).toBe('合成属地');
    expect(result.data[0].author_tag).toEqual([
      { type: 'identity', text: '提问者' },
    ]);
    expect(getCommentIdentityBadges(result.data[0].child_comments[0])).toEqual(
      getCommentIdentityBadges(comment),
    );
  },
);

test('legacy detail responses and routed parents retain their identity labels', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ data: comment });
  const result = await getComment('synthetic-comment');
  const parent = parseParentComment(
    serializeParentComment(result, 1),
    'synthetic-comment',
    1,
  );
  expect(parent).not.toBeNull();
  expect(getCommentIdentityBadges(parent ?? comment)).toEqual(
    getCommentIdentityBadges(comment),
  );
});

test('reply target labels do not inherit the replying author identity', async () => {
  const reply: CommentItem = {
    ...comment,
    reply_to_author: { member: { ...member, is_following: false } },
    reply_author_tag: [{ type: 'author', text: '作者' }],
  };
  expect(getCommentIdentityBadges(reply, 'reply')).toEqual(['作者']);
  const host = await render(
    <Text>
      合成回复对象
      <CommentIdentityBadges comment={reply} target="reply" />
    </Text>,
  );
  expect(host.getByText(/· 作者/)).toBeVisible();
  expect(host.queryByText(/我关注的人/)).toBeNull();
  expect(host.queryByText(/热评/)).toBeNull();
});

test('author identity labels render as readable text', async () => {
  const host = await render(
    <Text>
      {member.name}
      <CommentIdentityBadges comment={comment} />
    </Text>,
  );
  for (const label of ['作者', '我关注的人', '提问者', '热评'])
    expect(host.getByText(` · ${label}`)).toBeVisible();
  expect(host.queryByText(/合成属地/)).toBeNull();
});
