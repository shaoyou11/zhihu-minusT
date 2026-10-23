import { type AxiosRequestConfig, CanceledError } from 'axios';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import apiClient, {
  type ApiRequestOptions,
  hasAuthenticationCookie,
} from '../client';

export interface ContentReadTarget {
  type: 'answer' | 'question';
  id: string;
}

type LastReadOptions = ApiRequestOptions & { sessionVersion?: number };

/** Report an answer that is being read through Zhihu's Web touch endpoint. */
export async function touchAnswerRead(
  answerId: string,
  options: LastReadOptions = {},
): Promise<void> {
  await touchAnswersRead([answerId], options);
}

/** Report a returned page of answers in a single Web touch request. */
export async function touchAnswersRead(
  answerIds: readonly string[],
  options: LastReadOptions = {},
): Promise<void> {
  await reportLastRead(
    answerIds.map((id) => ({ type: 'answer', id })),
    'touch',
    options,
  );
}

/** Report opened question/answer content in a single Web read request. */
export async function readContents(
  targets: readonly ContentReadTarget[],
  options: LastReadOptions = {},
): Promise<void> {
  await reportLastRead(targets, 'read', options);
}

async function reportLastRead(
  targets: readonly ContentReadTarget[],
  action: 'touch' | 'read',
  options: LastReadOptions,
): Promise<void> {
  const seen = new Set<string>();
  const items: [ContentReadTarget['type'], string, typeof action][] = [];
  for (const target of targets) {
    const id = target.id.trim();
    const key = `${target.type}:${id}`;
    if (!id || seen.has(key)) continue;
    seen.add(key);
    items.push([target.type, id, action]);
  }
  if (items.length === 0) return;

  const sessionVersion = options.sessionVersion ?? getAuthSessionVersion();
  if (sessionVersion !== getAuthSessionVersion()) {
    throw new CanceledError('登录会话已切换');
  }
  if (!hasAuthenticationCookie(useAuthStore.getState().cookies)) return;

  const form = new FormData();
  form.append('items', JSON.stringify(items));
  const config: AxiosRequestConfig & {
    zhihuSessionVersion: number;
    zhihuSkipVerification: boolean;
  } = {
    baseURL: 'https://www.zhihu.com',
    // React Native supplies the multipart boundary when serializing FormData.
    headers: {
      'Content-Type': 'multipart/form-data',
      'x-requested-with': 'fetch',
      Referer: 'https://www.zhihu.com/',
    },
    signal: options.signal,
    zhihuSessionVersion: sessionVersion,
    // Optional feedback must not open a verification modal over the content.
    zhihuSkipVerification: true,
  };
  await apiClient.post<unknown>('/lastread/touch', form, config);
}
