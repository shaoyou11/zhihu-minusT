import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { CanceledError } from 'axios';
import type { PropsWithChildren } from 'react';
import apiClient from '../src/api/client';
import { normalizeAnswerPagerPage } from '../src/api/zhihu/answerPager';
import { getQuestionAnswers } from '../src/api/zhihu/question';
import {
  type AnswerPagerSourceOptions,
  useAnswerPagerSource,
} from '../src/hooks/useAnswerPagerSource';
import { useAuthStore } from '../src/store/useAuthStore';
import { getGuestAnswerKey } from '../src/utils/guestAnswer';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  hasAuthenticationCookie: (cookie: string | null) =>
    Boolean(cookie?.includes('z_c0=')),
}));

let mockSessionVersion = 1;
jest.mock('../src/store/useAuthStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    getAuthSessionVersion: () => mockSessionVersion,
    useAuthStore: create(() => ({ cookies: null })),
  };
});

function page(ids: string[], next = '') {
  return {
    data: ids.map((id) => ({
      id,
      type: 'answer',
      question: { id: `question-${id}` },
      content: '<p>合成列表正文</p>',
      paid_info: { has_paid: false },
      content_need_truncated: true,
    })),
    paging: { is_end: !next, next, previous: '', totals: ids.length },
  };
}

test('preserves direct thin answer label metadata without promoting list entries to body content', () => {
  const endorsements = [
    {
      elements: [
        { type: 'IMAGE', image_key: 'zhicon_icon_24_column_fill' },
        { type: 'TEXT', content: '收录于 · 合成专栏' },
      ],
    },
  ];
  const result = normalizeAnswerPagerPage({
    data: [
      { id: 'thin-answer', type: 'answer', endorsements },
      { id: 'empty-labels', type: 'answer', endorsements: [] },
      { id: 'malformed-labels', type: 'answer', endorsements: {} },
      {
        id: 'with-body',
        type: 'answer',
        content: '<p>列表正文不应被认证为详情</p>',
        endorsements,
      },
    ],
    need_force_login: false,
    paging: { is_end: true, next: '' },
  });
  expect(result.data).toEqual([
    { id: 'thin-answer', endorsements },
    { id: 'empty-labels', endorsements: [] },
    { id: 'malformed-labels' },
    { id: 'with-body', endorsements },
  ]);
  expect(result.data[0].endorsements).toBe(endorsements);
  for (const item of result.data) expect(item).not.toHaveProperty('content');
});

test('pages all non-profile origins within their question and isolates profile and account changes', async () => {
  const get = jest.mocked(apiClient.get);
  get.mockReset();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: 'z_c0=synthetic-account' });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const options: AnswerPagerSourceOptions = {
    initialId: 'selected',
    questionId: 'selected-question',
    sortBy: 'default',
    context: { scene: 'recommend' },
  };
  get
    .mockResolvedValueOnce({
      data: page(
        ['selected', 'same-question-next'],
        'https://www.zhihu.com/api/v4/questions/selected-question/answers?offset=20',
      ),
    })
    .mockResolvedValueOnce({ data: page(['same-question-last']) });
  const host = await renderHook(useAnswerPagerSource, {
    initialProps: options,
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    1,
    'recommend',
    'selected-question',
    'default',
  ]);
  expect(host.result.current.isQuestionSource).toBe(true);
  expect(get.mock.calls[0]).toEqual([
    '/questions/selected-question/answers',
    {
      signal: expect.any(AbortSignal),
      params: {
        include: 'data[*].id,endorsements',
        limit: 20,
        offset: 0,
        sort_by: 'default',
      },
    },
  ]);
  expect(host.result.current.hasNextPage).toBe(true);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(
      host.result.current.data?.pages.flatMap((item) =>
        item.data.map((answer) => answer.id),
      ),
    ).toEqual(['selected', 'same-question-next', 'same-question-last']),
  );
  expect(get.mock.calls[1][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ offset: 20, sort_by: 'default' }),
    }),
  );
  expect(host.result.current.hasNextPage).toBe(false);
  const recommendationKey = host.result.current.pagerKey;
  await host.rerender({ ...options, questionId: undefined, sortBy: 'created' });
  expect(host.result.current.data).toBeUndefined();
  expect(get).toHaveBeenCalledTimes(2);
  get.mockResolvedValueOnce({ data: page(['resolved-question-answer']) });
  await host.rerender({
    ...options,
    questionId: undefined,
    sortBy: 'created',
    initialAnswer: {
      id: 'selected',
      question: {
        id: 'resolved-question',
        title: '合成问题',
        type: 'question',
      },
      author: {
        id: 'synthetic-author',
        name: '合成作者',
        avatar_url: '',
        type: 'people',
      },
      content: '<p>合成所选正文</p>',
      excerpt: '合成摘要',
      created_time: 0,
      voteup_count: 0,
      comment_count: 0,
    },
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(get.mock.calls[2]).toEqual([
    '/questions/resolved-question/answers',
    {
      signal: expect.any(AbortSignal),
      params: {
        include: 'data[*].id,endorsements',
        limit: 20,
        offset: 0,
        sort_by: 'created',
      },
    },
  ]);
  expect(host.result.current.data?.pages[0].data[0].id).toBe(
    'resolved-question-answer',
  );
  get
    .mockResolvedValueOnce({
      data: page(
        ['selected', 'unknown-origin-next'],
        'https://www.zhihu.com/api/v4/questions/selected-question/answers?offset=20',
      ),
    })
    .mockResolvedValueOnce({ data: page(['unknown-origin-last']) });
  await host.rerender({ ...options, context: { scene: 'unknown' } });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    1,
    'unknown',
    'selected-question',
    'default',
  ]);
  expect(host.result.current.isQuestionSource).toBe(true);
  expect(get.mock.calls[3][0]).toBe('/questions/selected-question/answers');
  expect(host.result.current.data?.pages[0].data).toEqual([
    { id: 'selected', question: { id: 'question-selected' } },
    {
      id: 'unknown-origin-next',
      question: { id: 'question-unknown-origin-next' },
    },
  ]);
  expect(host.result.current.hasNextPage).toBe(true);
  expect(host.result.current.pagerKey).not.toBe(recommendationKey);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(host.result.current.data?.pages[1]?.data[0]?.id).toBe(
      'unknown-origin-last',
    ),
  );
  expect(get.mock.calls[4][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ offset: 20, sort_by: 'default' }),
    }),
  );
  expect(host.result.current.hasNextPage).toBe(false);
  expect(get).toHaveBeenCalledTimes(5);

  const profileStart = get.mock.calls.length;
  get
    .mockResolvedValueOnce({
      data: page(
        ['selected', 'other-question'],
        'https://www.zhihu.com/api/v4/members/member-a/answers?offset=20',
      ),
    })
    .mockResolvedValueOnce({ data: page(['third-question']) });
  await host.rerender({
    ...options,
    context: {
      scene: 'profile_answer',
      memberId: 'member-a',
      memberSort: 'voteups',
    },
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.isQuestionSource).toBe(false);
  const profileKey = host.result.current.pagerKey;
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    1,
    'profile_answer',
    'member-a',
    'voteups',
  ]);
  expect(get.mock.calls[profileStart]).toEqual([
    '/members/member-a/answers',
    {
      signal: expect.any(AbortSignal),
      params: {
        include:
          'data[*].id,question.id,endorsements;data[*].favlists_count,reaction,relationship.is_favorited',
        limit: 20,
        offset: 0,
        sort_by: 'voteups',
        ws_qiangzhisafe: 0,
      },
    },
  ]);
  expect(host.result.current.data?.pages[0].data).toEqual([
    { id: 'selected', question: { id: 'question-selected' } },
    { id: 'other-question', question: { id: 'question-other-question' } },
  ]);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(get.mock.calls[profileStart + 1][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ offset: 20 }),
    }),
  );
  await waitFor(() =>
    expect(host.result.current.data?.pages[1]?.data[0]?.id).toBe(
      'third-question',
    ),
  );
  expect(host.result.current.hasNextPage).toBe(false);

  let resolveOldRequest:
    | ((value: { data: ReturnType<typeof page> }) => void)
    | undefined;
  let oldRequestSignal: AbortSignal | undefined;
  let transportAborted = false;
  get
    .mockImplementationOnce(
      (_url, requestOptions) =>
        new Promise((resolve, reject) => {
          resolveOldRequest = resolve;
          const signal = requestOptions?.signal;
          if (!(signal instanceof AbortSignal))
            throw new Error('Profile pager must forward its abort signal');
          oldRequestSignal = signal;
          signal.addEventListener(
            'abort',
            () => {
              transportAborted = true;
              reject(new CanceledError('synthetic request aborted'));
            },
            { once: true },
          );
        }),
    )
    .mockResolvedValueOnce({ data: page(['new-session-answer']) });
  await host.rerender({
    ...options,
    context: { scene: 'profile_answer', memberId: 'member-b' },
  });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(profileStart + 3));
  expect(host.result.current.data).toBeUndefined();
  expect(host.result.current.pagerKey).not.toBe(profileKey);
  const oldSessionKey = host.result.current.queryKey;
  expect(oldRequestSignal?.aborted).toBe(false);
  await act(async () => {
    mockSessionVersion = 2;
    useAuthStore.setState({ cookies: 'z_c0=synthetic-new-session' });
  });
  await waitFor(() =>
    expect(host.result.current.data?.pages[0].data[0].id).toBe(
      'new-session-answer',
    ),
  );
  expect(oldRequestSignal?.aborted).toBe(true);
  expect(transportAborted).toBe(true);
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    2,
    'profile_answer',
    'member-b',
    'created',
  ]);
  await act(async () => {
    resolveOldRequest?.({ data: page(['old-session-answer']) });
  });
  expect(client.getQueryData(oldSessionKey)).toBeUndefined();
  expect(host.result.current.data?.pages[0].data[0].id).toBe(
    'new-session-answer',
  );

  get.mockResolvedValueOnce({ data: page(['question-answer']) });
  await host.rerender({
    ...options,
    context: { scene: 'question_feed' },
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(get.mock.calls[profileStart + 4]).toEqual([
    '/questions/selected-question/answers',
    {
      signal: expect.any(AbortSignal),
      params: {
        include: 'data[*].id,endorsements',
        limit: 20,
        offset: 0,
        sort_by: 'default',
      },
    },
  ]);
  await host.unmount();
  client.clear();
});

test('waits for an unknown origin answer to resolve its question, then pages and switches question sort', async () => {
  const get = jest.mocked(apiClient.get);
  get.mockReset();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: 'z_c0=synthetic-account' });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const options: AnswerPagerSourceOptions = {
    initialId: 'selected',
    sortBy: 'created',
    context: { scene: 'unknown' },
  };
  const host = await renderHook(useAnswerPagerSource, {
    initialProps: options,
    wrapper,
  });
  expect(get).not.toHaveBeenCalled();
  expect(host.result.current.data).toBeUndefined();
  expect(host.result.current.isFetching).toBe(false);
  expect(host.result.current.isQuestionSource).toBe(true);
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    1,
    'unknown',
    '',
    'created',
  ]);

  const resolvedOptions: AnswerPagerSourceOptions = {
    ...options,
    initialAnswer: {
      id: 'selected',
      question: {
        id: 'resolved-question',
        title: '合成问题',
        type: 'question',
      },
      author: {
        id: 'synthetic-author',
        name: '合成作者',
        avatar_url: '',
        type: 'people',
      },
      content: '<p>合成所选正文</p>',
      excerpt: '合成摘要',
      created_time: 0,
      voteup_count: 0,
      comment_count: 0,
    },
  };
  get
    .mockResolvedValueOnce({
      data: page(
        ['same-question-first'],
        'https://www.zhihu.com/api/v4/questions/resolved-question/answers?offset=40',
      ),
    })
    .mockResolvedValueOnce({ data: page(['same-question-next']) });
  await host.rerender(resolvedOptions);
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  const createdKey = host.result.current.queryKey;
  expect(createdKey).toEqual([
    'answer-pager-source',
    1,
    'unknown',
    'resolved-question',
    'created',
  ]);
  expect(get.mock.calls[0]).toEqual([
    '/questions/resolved-question/answers',
    {
      signal: expect.any(AbortSignal),
      params: {
        include: 'data[*].id,endorsements',
        limit: 20,
        offset: 0,
        sort_by: 'created',
      },
    },
  ]);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(get.mock.calls[1][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ offset: 40, sort_by: 'created' }),
    }),
  );
  await waitFor(() =>
    expect(
      host.result.current.data?.pages.flatMap((item) => item.data),
    ).toHaveLength(2),
  );
  expect(host.result.current.hasNextPage).toBe(false);

  get.mockResolvedValueOnce({ data: page(['default-order-answer']) });
  await host.rerender({ ...resolvedOptions, sortBy: 'default' });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'answer-pager-source',
    1,
    'unknown',
    'resolved-question',
    'default',
  ]);
  expect(host.result.current.queryKey).not.toEqual(createdKey);
  expect(get.mock.calls[2][1]).toEqual(
    expect.objectContaining({
      params: expect.objectContaining({ offset: 0, sort_by: 'default' }),
    }),
  );
  expect(host.result.current.data?.pages[0]?.data[0]?.id).toBe(
    'default-order-answer',
  );
  await host.unmount();
  client.clear();
});

function guestPage(ids: string[], next = '') {
  return {
    data: ids.map((id) => ({
      type: 'question_feed_card',
      target_type: 'answer',
      target: {
        id,
        author: {
          id: `author-${id}`,
          name: '合成游客作者',
          avatar_url: '',
          type: 'people',
        },
        big_card_summary: `合成摘要 ${id}`,
        endorsements: [{ elements: [{ type: 'TEXT', content: '合成标签' }] }],
      },
    })),
    paging: { is_end: !next, next },
  };
}

test.each([
  'https://example.invalid/questions/guest-question/feeds?cursor=synthetic',
  'http://api.zhihu.com/questions/guest-question/feeds?cursor=synthetic',
  'https://api.zhihu.com:8443/questions/guest-question/feeds?cursor=synthetic',
  'https://synthetic@api.zhihu.com/questions/guest-question/feeds',
  'https://api.zhihu.com/questions/other-question/feeds',
  'https://api.zhihu.com/questions/guest-question/answers',
  'https://api.zhihu.com/answers/guest-answer',
  'https://[invalid',
])(
  'rejects guest question pagination outside its public feed: %s',
  async (next) => {
    const get = jest.mocked(apiClient.get);
    get.mockReset();
    useAuthStore.setState({ cookies: null });
    await expect(
      getQuestionAnswers('guest-question', next, 'default', ''),
    ).rejects.toThrow('回答列表分页地址无效');
    expect(get).not.toHaveBeenCalled();
  },
);

test('pages guest question cards with the complete next URL and caches readable summaries separately', async () => {
  const get = jest.mocked(apiClient.get);
  get.mockReset();
  mockSessionVersion = 10;
  useAuthStore.setState({ cookies: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const next =
    'https://api.zhihu.com/questions/guest-question/feeds?cursor=synthetic-cursor&session_id=synthetic-session&order=updated';
  get
    .mockResolvedValueOnce({ data: guestPage(['selected', 'next'], next) })
    .mockResolvedValueOnce({ data: guestPage(['last']) });
  const options: AnswerPagerSourceOptions = {
    initialId: 'selected',
    questionId: 'guest-question',
    sortBy: 'created',
    context: { scene: 'question_feed' },
  };
  const host = await renderHook(useAnswerPagerSource, {
    initialProps: options,
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  const firstUrl = new URL(String(get.mock.calls[0][0]));
  expect(firstUrl.origin).toBe('https://api.zhihu.com');
  expect(firstUrl.pathname).toBe('/questions/guest-question/feeds');
  expect(firstUrl.searchParams.get('order')).toBe('updated');
  expect(get.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  expect(host.result.current.data?.pages[0].data).toEqual([
    {
      id: 'selected',
      endorsements: [{ elements: [{ type: 'TEXT', content: '合成标签' }] }],
    },
    {
      id: 'next',
      endorsements: [{ elements: [{ type: 'TEXT', content: '合成标签' }] }],
    },
  ]);
  expect(client.getQueryData(getGuestAnswerKey('next', 10))).toMatchObject({
    id: 'next',
    content: '<p>合成摘要 next</p>',
    content_need_truncated: true,
    question: { id: 'guest-question' },
  });
  expect(
    client.getQueryCache().findAll({ queryKey: ['answer-detail'] }),
  ).toHaveLength(0);
  expect(host.result.current.hasNextPage).toBe(true);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(get.mock.calls[1][0]).toBe(next);
  expect(get.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  await waitFor(() =>
    expect(host.result.current.data?.pages[1]?.data[0].id).toBe('last'),
  );
  expect(host.result.current.hasNextPage).toBe(false);

  get.mockResolvedValueOnce({ data: page(['account-answer']) });
  await act(async () => {
    mockSessionVersion = 11;
    useAuthStore.setState({ cookies: 'z_c0=synthetic-account' });
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(get.mock.calls[2][0]).toBe('/questions/guest-question/answers');
  expect(host.result.current.data?.pages[0].data[0].id).toBe('account-answer');

  get.mockResolvedValueOnce({ data: guestPage(['new-guest-answer']) });
  await act(async () => {
    mockSessionVersion = 12;
    useAuthStore.setState({ cookies: null });
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(new URL(String(get.mock.calls[3][0])).pathname).toBe(
    '/questions/guest-question/feeds',
  );
  expect(host.result.current.data?.pages[0].data[0].id).toBe(
    'new-guest-answer',
  );
  expect(
    client.getQueryData(getGuestAnswerKey('new-guest-answer', 12)),
  ).toMatchObject({ content: '<p>合成摘要 new-guest-answer</p>' });
  expect(
    client.getQueryData(getGuestAnswerKey('account-answer', 12)),
  ).toBeUndefined();
  await host.unmount();
  client.clear();
});

test('discards a late guest page before it can seed any answer after the session changes', async () => {
  const get = jest.mocked(apiClient.get);
  get.mockReset();
  mockSessionVersion = 20;
  useAuthStore.setState({ cookies: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  let resolveOldRequest:
    | ((value: { data: ReturnType<typeof guestPage> }) => void)
    | undefined;
  get
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOldRequest = resolve;
        }),
    )
    .mockResolvedValueOnce({ data: guestPage(['fresh-guest-answer']) });
  const host = await renderHook(useAnswerPagerSource, {
    initialProps: {
      initialId: 'selected',
      questionId: 'guest-question',
      sortBy: 'default',
      context: { scene: 'question_feed' },
    } satisfies AnswerPagerSourceOptions,
    wrapper,
  });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  const oldKey = host.result.current.queryKey;
  const oldSignal = get.mock.calls[0][1]?.signal;
  await act(async () => {
    mockSessionVersion = 21;
    useAuthStore.setState({ cookies: '' });
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {
    resolveOldRequest?.({ data: guestPage(['stale-guest-answer']) });
  });
  expect(client.getQueryData(oldKey)).toBeUndefined();
  expect(
    client.getQueryData(getGuestAnswerKey('stale-guest-answer', 20)),
  ).toBeUndefined();
  expect(
    client.getQueryData(getGuestAnswerKey('stale-guest-answer', 21)),
  ).toBeUndefined();
  expect(host.result.current.data?.pages[0].data[0].id).toBe(
    'fresh-guest-answer',
  );
  await host.unmount();
  client.clear();
});
