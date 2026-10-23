import axios, { CanceledError } from 'axios';
import apiClient from '../src/api/client';
import {
  readContents,
  touchAnswerRead,
  touchAnswersRead,
} from '../src/api/zhihu/lastRead';

jest.mock('../src/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  hasAuthenticationCookie: (cookie: string | null | undefined) =>
    typeof cookie === 'string' && /(?:^|;\s*)z_c0=[^;\s]+/.test(cookie),
}));

let mockSessionVersion = 3;
let mockCookies = 'z_c0=synthetic-session';
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: { getState: () => ({ cookies: mockCookies }) },
}));

const post = jest.mocked(apiClient.post);
const ANSWER_ID = '2093868403115155780';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  mockSessionVersion = 3;
  mockCookies = 'z_c0=synthetic-session';
});

test('posts the exact Web multipart touch field without losing large answer IDs', async () => {
  const controller = new AbortController();
  await touchAnswerRead(ANSWER_ID, { signal: controller.signal });

  expect(post).toHaveBeenCalledTimes(1);
  const [url, body, config] = post.mock.calls[0];
  expect(axios.getUri({ ...config, url })).toBe(
    'https://www.zhihu.com/lastread/touch',
  );
  expect(config).toEqual({
    baseURL: 'https://www.zhihu.com',
    headers: {
      'Content-Type': 'multipart/form-data',
      'x-requested-with': 'fetch',
      Referer: 'https://www.zhihu.com/',
    },
    signal: controller.signal,
    zhihuSessionVersion: 3,
    zhihuSkipVerification: true,
  });
  expect(body).toBeInstanceOf(FormData);
  expect((body as FormData).getAll('items')).toEqual([
    JSON.stringify([['answer', ANSWER_ID, 'touch']]),
  ]);
  expect((body as FormData).getAll('targets')).toEqual([]);
});

test('passes the originating session to the client for asynchronous session checks', async () => {
  await touchAnswerRead('42', { sessionVersion: 3 });
  expect(post.mock.calls[0][2]).toEqual(
    expect.objectContaining({ zhihuSessionVersion: 3 }),
  );
});

test('posts a whole batch once, preserving large string IDs and first occurrence order', async () => {
  const ids = [
    ` ${ANSWER_ID} `,
    '',
    '2093868403115155781',
    ANSWER_ID,
    ' \n\t ',
    ' 42 ',
    '2093868403115155781',
  ] as const;
  const controller = new AbortController();
  await touchAnswersRead(ids, {
    sessionVersion: 3,
    signal: controller.signal,
  });

  expect(post).toHaveBeenCalledTimes(1);
  const [url, body, config] = post.mock.calls[0];
  expect(url).toBe('/lastread/touch');
  expect((body as FormData).getAll('items')).toEqual([
    JSON.stringify([
      ['answer', ANSWER_ID, 'touch'],
      ['answer', '2093868403115155781', 'touch'],
      ['answer', '42', 'touch'],
    ]),
  ]);
  expect(config).toEqual(
    expect.objectContaining({
      zhihuSessionVersion: 3,
      zhihuSkipVerification: true,
      signal: controller.signal,
    }),
  );
  expect(ids[0]).toBe(` ${ANSWER_ID} `);
});

test.each([{ ids: [] }, { ids: ['', ' \n\t '] }])(
  'skips batches without answer IDs (%#)',
  async ({ ids }) => {
    await touchAnswersRead(ids);
    expect(post).not.toHaveBeenCalled();
  },
);

test('rejects a whole outgoing batch after its originating account changes', async () => {
  await expect(
    touchAnswersRead(['42', '43'], { sessionVersion: 2 }),
  ).rejects.toBeInstanceOf(CanceledError);
  expect(post).not.toHaveBeenCalled();
});

test('does not send an unauthenticated batch', async () => {
  mockCookies = '';
  await touchAnswersRead(['42', '43']);
  expect(post).not.toHaveBeenCalled();
});

test('reads questions and answers in one batch, deduplicating by type and preserving string IDs', async () => {
  const controller = new AbortController();
  await readContents(
    [
      { type: 'question', id: ` ${ANSWER_ID} ` },
      { type: 'answer', id: ANSWER_ID },
      { type: 'question', id: ANSWER_ID },
      { type: 'answer', id: '2093868403115155781' },
      { type: 'answer', id: ' ' },
    ],
    { signal: controller.signal, sessionVersion: 3 },
  );

  expect(post).toHaveBeenCalledTimes(1);
  const [url, body, config] = post.mock.calls[0];
  expect(url).toBe('/lastread/touch');
  expect((body as FormData).getAll('items')).toEqual([
    JSON.stringify([
      ['question', ANSWER_ID, 'read'],
      ['answer', ANSWER_ID, 'read'],
      ['answer', '2093868403115155781', 'read'],
    ]),
  ]);
  expect(config).toEqual(
    expect.objectContaining({
      signal: controller.signal,
      zhihuSessionVersion: 3,
      zhihuSkipVerification: true,
    }),
  );
});

test('skips empty and unauthenticated read requests', async () => {
  await readContents([]);
  await readContents([{ type: 'question', id: ' ' }]);
  mockCookies = '';
  await readContents([{ type: 'answer', id: '42' }]);
  expect(post).not.toHaveBeenCalled();
});

test('rejects read events from an outdated authentication session', async () => {
  await expect(
    readContents([{ type: 'question', id: '7' }], { sessionVersion: 2 }),
  ).rejects.toBeInstanceOf(CanceledError);
  expect(post).not.toHaveBeenCalled();
});

test('rejects an outgoing account event before creating a request for the current account', async () => {
  await expect(
    touchAnswerRead('42', { sessionVersion: 2 }),
  ).rejects.toBeInstanceOf(CanceledError);
  expect(post).not.toHaveBeenCalled();
});

test.each(['', 'd_c0=synthetic-tracking', 'z_c0=; d_c0=synthetic-tracking'])(
  'skips unauthenticated requests (%#)',
  async (cookies) => {
    mockCookies = cookies;
    await touchAnswerRead('42');
    expect(post).not.toHaveBeenCalled();
  },
);

test.each(['', ' \n\t '])(
  'does not report an empty answer ID (%#)',
  async (id) => {
    await touchAnswerRead(id);
    expect(post).not.toHaveBeenCalled();
  },
);

test('propagates a failed request so the reading hook can handle it without blocking content', async () => {
  const failure = new Error('Synthetic request failure');
  post.mockRejectedValueOnce(failure);
  await expect(touchAnswerRead('42')).rejects.toBe(failure);
});
