import type { FeedItem } from '../src/api/zhihu/feed';
import type { ZhihuReadingPreviewItem } from '../src/api/zhihu/nextRender';
import { normalizeZhihuAnswerPreviewPage } from '../src/api/zhihu/nextRender';
import {
  formatAnswerPublishInfo,
  getAnswerPublishInfo,
  getNextRenderPublishInfo,
  shouldShowPreviewQuestion,
} from '../src/utils/answerPreviewDisplay';
import { createAnswerPreviewEntry } from '../src/utils/answerPreviewEntry';
import { parseRecommendData } from '../src/utils/recommendFeed';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../src/features/rich-content', () => ({
  ...jest.requireActual('../src/features/rich-content/structuredContent'),
  ...jest.requireActual('../src/features/rich-content/queryPolicy'),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => 1,
}));

function answer(id: string, questionId: string): ZhihuReadingPreviewItem {
  return {
    id,
    type: 'answer',
    question: { id: questionId, title: `问题 ${questionId}` },
    author: {
      id: 'author',
      name: '合成作者',
      url_token: '',
      avatar_url: '',
      headline: '',
    },
    excerpt: '',
    voteup_count: 0,
    comment_count: 0,
    relationship: { is_author: false, voting: 0 },
    content: '<p>合成正文</p>',
  };
}

const loginPrompt: ZhihuReadingPreviewItem = {
  id: 'login',
  type: 'login_prompt',
  description: '登录后继续阅读',
};

test('shows a question title once per run of answers to that question', () => {
  const items = [
    answer('a1', 'q1'),
    answer('a2', 'q1'),
    answer('a3', 'q2'),
    loginPrompt,
    answer('a4', 'q2'),
    answer('a5', 'q1'),
  ];
  expect(
    items.map((_, index) => shouldShowPreviewQuestion(items, index)),
  ).toEqual([true, false, true, false, false, true]);
});

test('question feeds keep the page question implicit and title other questions once', () => {
  const items = [answer('a1', 'q1'), answer('a2', 'q2'), answer('a3', 'q2')];
  expect(
    items.map((_, index) => shouldShowPreviewQuestion(items, index, 'q1')),
  ).toEqual([false, true, false]);
});

test('labels detail timestamps and IP location like the answer detail page', () => {
  const created = new Date(2026, 9, 18, 12).getTime() / 1000;
  const edited = new Date(2026, 9, 19, 9).getTime() / 1000;
  expect(
    getAnswerPublishInfo({
      created_time: created,
      updated_time: edited,
      ip_info: ' IP 属地广东 ',
    }),
  ).toEqual({
    published: '发布于 2026-10-18',
    edited: '编辑于 2026-10-19',
    location: 'IP 属地广东',
  });
  expect(
    getAnswerPublishInfo({ created_time: created, updated_time: created + 60 }),
  ).toEqual({ published: '发布于 2026-10-18' });
  expect(
    getAnswerPublishInfo({ created_time: 0, updated_time: Number.NaN }),
  ).toBeUndefined();
});

test('labels the bare next-render values and leaves labelled ones alone', () => {
  expect(
    getNextRenderPublishInfo({
      create_time_text: '2026-09-18 15:27',
      update_time_text: '编辑于 2026-09-18 17:29',
      ip_info: '天津',
    }),
  ).toEqual({
    published: '发布于 2026-09-18 15:27',
    edited: '编辑于 2026-09-18 17:29',
    location: 'IP 属地天津',
  });
  expect(
    getNextRenderPublishInfo({
      create_time_text: '发布于 2026-09-18 15:27',
      ip_info: 'IP 属地天津',
    }),
  ).toEqual({ published: '发布于 2026-09-18 15:27', location: 'IP 属地天津' });
  expect(
    getNextRenderPublishInfo({ create_time_text: ' ', ip_info: '' }),
  ).toBeUndefined();
  expect(getNextRenderPublishInfo(undefined)).toBeUndefined();
});

test('puts publish time with location and the edit time on its own line', () => {
  expect(
    formatAnswerPublishInfo({
      published: '发布于 2026-09-18 15:27',
      edited: '编辑于 2026-09-18 17:29',
      location: 'IP 属地天津',
    }),
  ).toEqual([
    '发布于 2026-09-18 15:27 · IP 属地天津',
    '编辑于 2026-09-18 17:29',
  ]);
  expect(formatAnswerPublishInfo({ edited: '编辑于 2026-09-18' })).toEqual([
    '编辑于 2026-09-18',
  ]);
});

test('preview entries from answer details carry publish info', () => {
  const created = new Date(2026, 9, 18, 12).getTime() / 1000;
  expect(
    createAnswerPreviewEntry({
      id: 'a1',
      content: '<p>合成正文</p>',
      created_time: created,
      ip_info: 'IP 属地上海',
    })?.publishInfo,
  ).toEqual({ published: '发布于 2026-10-18', location: 'IP 属地上海' });
  expect(
    createAnswerPreviewEntry({ id: 'a2', content: '<p>合成正文</p>' }),
  ).not.toHaveProperty('publishInfo');
});

test.each([false, true])(
  'recommendation and local feed entries retain answer dates (restored cache: %s)',
  (restoredCache) => {
    const created = new Date(2026, 9, 18, 12).getTime() / 1000;
    const updated = new Date(2026, 9, 19, 9).getTime() / 1000;
    const item = parseRecommendData({
      created_time: created - 86400,
      updated_time: updated + 86400,
      target: {
        id: 'a1',
        type: 'answer',
        content: '<p>合成正文</p>',
        created_time: created,
        updated_time: updated,
      },
    });
    if (!item) throw new Error('Expected an answer feed item');
    const source: FeedItem = restoredCache
      ? JSON.parse(JSON.stringify(item))
      : item;

    expect(createAnswerPreviewEntry(source)?.publishInfo).toEqual({
      published: '发布于 2026-10-18',
      edited: '编辑于 2026-10-19',
    });
  },
);

test('feed entries without answer dates remain usable without publish info', () => {
  const item = parseRecommendData({
    target: { id: 'a1', type: 'answer', content: '<p>合成正文</p>' },
  });
  if (!item) throw new Error('Expected an answer feed item');
  const restored: FeedItem = JSON.parse(JSON.stringify(item));
  const entry = createAnswerPreviewEntry(restored);

  expect(entry).toMatchObject({ id: 'a1', content: '<p>合成正文</p>' });
  expect(entry).not.toHaveProperty('publishInfo');
});

test('next-render answers read publish info from content_end_info', () => {
  const structured_content = {
    paging: JSON.stringify({
      is_end: true,
      is_start: true,
      next: '',
      previous: '',
      totals: 0,
    }),
    segments: [
      {
        id: 'p1',
        type: 'paragraph',
        paragraph: { pid: 'p1', text: '合成正文', marks: [] },
      },
    ],
  };
  const page = normalizeZhihuAnswerPreviewPage({
    data: [
      {
        id: 'a1',
        type: 'answer',
        question: { id: 'q1', title: '合成问题' },
        author: { id: 'author', fullname: '合成作者' },
        structured_content,
        content_end_info: {
          create_time_text: '2026-09-18 15:27',
          update_time_text: '',
          ip_info: '北京',
        },
      },
      {
        id: 'a2',
        type: 'answer',
        question: { id: 'q1', title: '合成问题' },
        author: { id: 'author', fullname: '合成作者' },
        structured_content,
      },
    ],
    paging: { is_end: true, is_start: true, next: '', previous: '', totals: 0 },
  });
  const [first, second] = page.data;
  expect(first.type === 'answer' && first.publishInfo).toEqual({
    published: '发布于 2026-09-18 15:27',
    location: 'IP 属地北京',
  });
  expect(second).not.toHaveProperty('publishInfo');
});
