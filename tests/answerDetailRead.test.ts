import { act, renderHook } from '@testing-library/react-native';
import { readContents } from '../src/api/zhihu/lastRead';
import {
  useAnswerDetailRead,
  useAnswerReadSession,
} from '../src/hooks/useAnswerDetailRead';

jest.mock('../src/api/zhihu/lastRead', () => ({ readContents: jest.fn() }));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null) => Boolean(cookie),
}));
let mockActive = true;
let mockSessionVersion = 1;
let mockCookies: string | null = 'synthetic-authentication';
jest.mock('../src/hooks/useActiveScreen', () => ({
  useActiveScreen: () => mockActive,
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: string | null }) => unknown) =>
    selector({ cookies: mockCookies }),
}));

interface ReadingProps {
  answerId: string;
  questionId?: string;
  enabled: boolean;
  scopeKey: string;
}

const initialProps: ReadingProps = {
  answerId: '84',
  questionId: '7',
  enabled: true,
  scopeKey: 'visit-a',
};

function setup(props: ReadingProps = initialProps) {
  return renderHook(
    (options: ReadingProps) => {
      const session = useAnswerReadSession(options.scopeKey);
      useAnswerDetailRead(
        options.answerId,
        options.questionId,
        options.enabled,
        session,
      );
      return session;
    },
    { initialProps: props },
  );
}

beforeEach(() => {
  jest.mocked(readContents).mockReset().mockResolvedValue(undefined);
  mockActive = true;
  mockSessionVersion = 1;
  mockCookies = 'synthetic-authentication';
});

test('first answer reads its question together, siblings read only answers, new questions read once', async () => {
  const host = await setup();
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '7' },
      { type: 'answer', id: '84' },
    ],
    { sessionVersion: 1 },
  );
  await host.rerender({ ...initialProps, answerId: '85' });
  expect(readContents).toHaveBeenLastCalledWith(
    [{ type: 'answer', id: '85' }],
    { sessionVersion: 1 },
  );
  await host.rerender({ ...initialProps, answerId: '86', questionId: '8' });
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '8' },
      { type: 'answer', id: '86' },
    ],
    { sessionVersion: 1 },
  );
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenCalledTimes(3);
});

test('mounted pager pages share question reservations while the first request is pending', async () => {
  jest.mocked(readContents).mockReturnValueOnce(new Promise(() => {}));
  const host = await renderHook(
    ({ selected }: { selected: string }) => {
      const session = useAnswerReadSession('pager');
      useAnswerDetailRead('84', '7', selected === '84', session);
      useAnswerDetailRead('85', '7', selected === '85', session);
    },
    { initialProps: { selected: '84' } },
  );
  expect(readContents).toHaveBeenCalledTimes(1);
  await host.rerender({ selected: '85' });
  expect(readContents).toHaveBeenLastCalledWith(
    [{ type: 'answer', id: '85' }],
    { sessionVersion: 1 },
  );
  await host.rerender({ selected: '84' });
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('waits for focused ready content and an active screen, leaving preloads unread', async () => {
  const host = await setup({ ...initialProps, enabled: false });
  expect(readContents).not.toHaveBeenCalled();
  mockActive = false;
  await host.rerender(initialProps);
  expect(readContents).not.toHaveBeenCalled();
  mockActive = true;
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenCalledTimes(1);
  await host.rerender({ ...initialProps, answerId: '85', enabled: false });
  expect(readContents).toHaveBeenCalledTimes(1);
});

test('guests are skipped and every account gets its own question and answer reservations', async () => {
  mockCookies = null;
  const host = await setup();
  expect(readContents).not.toHaveBeenCalled();
  mockCookies = 'synthetic-authentication';
  mockSessionVersion = 2;
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '7' },
      { type: 'answer', id: '84' },
    ],
    { sessionVersion: 2 },
  );
  mockSessionVersion = 3;
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '7' },
      { type: 'answer', id: '84' },
    ],
    { sessionVersion: 3 },
  );
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('failure allows question and answer to retry together on the next reading opportunity', async () => {
  jest.mocked(readContents).mockRejectedValueOnce(new Error('synthetic'));
  const host = await setup();
  await host.rerender({ ...initialProps, enabled: false });
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '7' },
      { type: 'answer', id: '84' },
    ],
    { sessionVersion: 1 },
  );
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('an old account failure cannot clear the current account reservations', async () => {
  let reject!: (error: Error) => void;
  jest.mocked(readContents).mockReturnValueOnce(
    new Promise<void>((_resolve, fail) => {
      reject = fail;
    }),
  );
  const host = await setup();
  mockSessionVersion = 2;
  await host.rerender(initialProps);
  await act(() => reject(new Error('synthetic old account failure')));
  await host.rerender({ ...initialProps, enabled: false });
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenCalledTimes(2);
});

test('a new pager scope and reopening the detail create new reading visits', async () => {
  const host = await setup();
  await host.rerender({ ...initialProps, scopeKey: 'visit-b' });
  expect(readContents).toHaveBeenCalledTimes(2);
  await host.unmount();
  await setup();
  expect(readContents).toHaveBeenCalledTimes(3);
});

test('missing question metadata still reads the answer and later pairs the question when available', async () => {
  const host = await setup({ ...initialProps, questionId: undefined });
  expect(readContents).toHaveBeenLastCalledWith(
    [{ type: 'answer', id: '84' }],
    { sessionVersion: 1 },
  );
  await host.rerender(initialProps);
  expect(readContents).toHaveBeenLastCalledWith(
    [
      { type: 'question', id: '7' },
      { type: 'answer', id: '84' },
    ],
    { sessionVersion: 1 },
  );
});

test('empty answer IDs cannot mark their question as read', async () => {
  await setup({ ...initialProps, answerId: ' ' });
  expect(readContents).not.toHaveBeenCalled();
});
