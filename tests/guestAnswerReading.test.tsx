import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { getAnswer } from '../src/api/zhihu';
import type { AnswerDetail } from '../src/api/zhihu/answer';
import { getQuestionAnswers } from '../src/api/zhihu/question';
import { useAnswerDetailQuery } from '../src/hooks/useAnswerDetailQuery';
import { useAuthStore } from '../src/store/useAuthStore';
import { seedAnswerPreviewEntry } from '../src/utils/answerPreviewEntry';
import {
  getGuestAnswerKey,
  seedGuestAnswerFromList,
} from '../src/utils/guestAnswer';
import { getZhihuErrorMessage } from '../src/utils/zhihuError';

let mockSessionVersion = 1;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: jest.requireActual('zustand').create(() => ({ cookies: null })),
}));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null) => Boolean(cookie),
}));
jest.mock('../src/api/zhihu', () => ({ getAnswer: jest.fn() }));
jest.mock('../src/api/zhihu/question', () => ({
  getQuestionAnswers: jest.fn(),
}));
jest.mock('../src/features/rich-content', () => ({
  RICH_CONTENT_STALE_TIME: 300000,
}));

const answer: AnswerDetail = {
  id: 'public-answer',
  type: 'answer',
  question: { id: 'question', title: '合成问题', type: 'question' },
  author: { id: 'author', name: '合成作者', avatar_url: '', type: 'people' },
  content: '<p>公开摘要</p>',
  excerpt: '公开摘要',
  content_need_truncated: true,
  created_time: 0,
  voteup_count: 3,
  comment_count: 2,
};
let client: QueryClient;
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: null });
  jest.mocked(getAnswer).mockReset();
  jest.mocked(getQuestionAnswers).mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
});

test('opens any provided guest card body without requesting Web details or certifying full content', async () => {
  seedGuestAnswerFromList(client, answer, 1);
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  expect(host.result.current.data).toEqual(answer);
  expect(host.result.current.isGuest).toBe(true);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getQuestionAnswers).not.toHaveBeenCalled();
  expect(client.getQueryData(['answer-detail', answer.id])).toBeUndefined();
});

test('reuses the clicked preview entry when a guest opens a Feed or profile card', async () => {
  seedAnswerPreviewEntry(client, answer);
  const host = await renderHook(() => useAnswerDetailQuery(String(answer.id)), {
    wrapper,
  });
  expect(host.result.current.data).toMatchObject({
    content: answer.content,
    content_need_truncated: true,
  });
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getQuestionAnswers).not.toHaveBeenCalled();
});

test('an uncached guest answer reads the public question feed with cancellation', async () => {
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [answer] });
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(getQuestionAnswers).toHaveBeenCalledWith(
    'question',
    0,
    'default',
    '',
    { signal: expect.any(AbortSignal) },
  );
  expect(host.result.current.data?.content_need_truncated).toBe(true);
  expect(getAnswer).not.toHaveBeenCalled();
});

test('a guest answer absent from public cards stops with an explicit message and permits manual retry', async () => {
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [] });
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  await waitFor(() => expect(host.result.current.isError).toBe(true));
  expect(getZhihuErrorMessage(host.result.current.error)).toBe(
    '游客暂时无法获取该回答，请登录后重试',
  );
  await host.rerender(undefined);
  expect(getQuestionAnswers).toHaveBeenCalledTimes(1);
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [answer] });
  await act(async () => {
    await host.result.current.refetch();
  });
  await waitFor(() =>
    expect(host.result.current.data?.content).toBe(answer.content),
  );
  expect(getQuestionAnswers).toHaveBeenCalledTimes(2);
  expect(getAnswer).not.toHaveBeenCalled();
});

test('a question supplied after mount recovers the missing public source exactly once', async () => {
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [answer] });
  const host = await renderHook(
    ({ questionId }: { questionId?: string }) =>
      useAnswerDetailQuery(String(answer.id), { questionId }),
    { wrapper, initialProps: {} },
  );
  await waitFor(() => expect(host.result.current.isError).toBe(true));
  expect(getQuestionAnswers).not.toHaveBeenCalled();
  await host.rerender({ questionId: 'question' });
  await waitFor(() => expect(host.result.current.data).toEqual(answer));
  expect(getQuestionAnswers).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
});

test('a delayed public source that fails settles instead of refetching on every render', async () => {
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [] });
  const host = await renderHook(
    ({ questionId }: { questionId?: string }) =>
      useAnswerDetailQuery(String(answer.id), { questionId }),
    { wrapper, initialProps: {} },
  );
  await waitFor(() => expect(host.result.current.isError).toBe(true));
  await host.rerender({ questionId: 'question' });
  await waitFor(() =>
    expect(host.result.current.error).toMatchObject({
      code: 'guest-answer-unavailable',
    }),
  );
  await host.rerender({ questionId: 'question' });
  expect(getQuestionAnswers).toHaveBeenCalledTimes(1);
  expect(host.result.current.isFetching).toBe(false);
});

test('refresh preserves the question title when the public feed omits it', async () => {
  seedGuestAnswerFromList(client, answer, 1);
  jest.mocked(getQuestionAnswers).mockResolvedValue({
    data: [
      { ...answer, question: undefined, content: '<p>更新的公开摘要</p>' },
    ],
  });
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  await act(async () => {
    await host.result.current.refetch();
  });
  await waitFor(() =>
    expect(host.result.current.data?.content).toBe('<p>更新的公开摘要</p>'),
  );
  expect(host.result.current.data?.question?.title).toBe('合成问题');
});

test('neither refresh nor a new list card downgrades a complete public body to a summary', async () => {
  const fullAnswer = {
    ...answer,
    content: '<p>已获取的完整公开正文</p>',
    content_need_truncated: false,
  };
  seedGuestAnswerFromList(client, fullAnswer, 1);
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [answer] });
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  await act(async () => {
    await host.result.current.refetch();
    seedGuestAnswerFromList(client, answer, 1);
  });
  expect(host.result.current.data).toEqual(fullAnswer);
  expect(client.getQueryData(getGuestAnswerKey(String(answer.id), 1))).toEqual(
    fullAnswer,
  );
  expect(client.getQueryData(['answer-detail', answer.id])).toBeUndefined();
});

test('switching from a signed-in reader to a guest cannot reuse private detail or an earlier guest session', async () => {
  useAuthStore.setState({ cookies: 'z_c0=synthetic-account' });
  const privateAnswer = { ...answer, content: '<p>登录正文</p>' };
  client.setQueryData(['answer-detail', answer.id], privateAnswer);
  seedGuestAnswerFromList(client, answer, 1);
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  expect(host.result.current.data).toBe(privateAnswer);
  let release: (value: { data: AnswerDetail[] }) => void = () => {};
  jest.mocked(getQuestionAnswers).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await act(() => {
    mockSessionVersion += 1;
    useAuthStore.setState({ cookies: null });
  });
  expect(host.result.current.data).toBeUndefined();
  expect(host.result.current.isGuest).toBe(true);
  await act(() => release({ data: [answer] }));
  await waitFor(() => expect(host.result.current.data).toEqual(answer));
  expect(client.getQueryData(['answer-detail', answer.id])).toBe(privateAnswer);
  expect(getAnswer).not.toHaveBeenCalled();
});

test('a late public response cannot populate a new account session', async () => {
  let release: (value: { data: AnswerDetail[] }) => void = () => {};
  jest.mocked(getQuestionAnswers).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const host = await renderHook(
    () => useAnswerDetailQuery(String(answer.id), { questionId: 'question' }),
    { wrapper },
  );
  jest
    .mocked(getAnswer)
    .mockResolvedValue({ ...answer, content: '<p>新账号</p>' });
  await act(() => {
    mockSessionVersion += 1;
    useAuthStore.setState({ cookies: 'z_c0=synthetic-new-account' });
  });
  await waitFor(() =>
    expect(host.result.current.data?.content).toBe('<p>新账号</p>'),
  );
  await act(() => release({ data: [answer] }));
  expect(host.result.current.data?.content).toBe('<p>新账号</p>');
  expect(
    client.getQueryData(getGuestAnswerKey(String(answer.id), 1)),
  ).toBeUndefined();
  seedGuestAnswerFromList(client, answer, 1);
  expect(
    client.getQueryData(getGuestAnswerKey(String(answer.id), 1)),
  ).toBeUndefined();
});
