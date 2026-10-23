import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  createContext,
  Suspense,
  startTransition,
  useLayoutEffect,
  useState,
} from 'react';
import { Text } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import QuestionLogScreen from '../src/app/question/[id]/log';

let mockQuestionId = '42';
let mockSessionVersion = 1;
let mockColorScheme = 'light';
const mockQuestionRouteContext = createContext<string | null>(null);
const mockBack = jest.fn();
const mockSyncCookies = jest.fn<Promise<void>, [string | null]>();
const mockAuthState = { cookies: 'z_c0=synthetic-session' };

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    id:
      jest.requireActual('react').useContext(mockQuestionRouteContext) ??
      mockQuestionId,
  }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('react-native-webview', () => ({
  WebView: (props: WebViewProps) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').View, props),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: Object.assign((selector: () => unknown) => selector(), {
    getState: () => mockAuthState,
  }),
}));
jest.mock('../src/utils/authSession', () => ({
  syncNativeSessionCookies: (cookies: string | null) =>
    mockSyncCookies(cookies),
}));
jest.mock('../src/components/DetailNavigationHeader', () => ({
  useDetailNavigationHeight: () => 56,
  DetailNavigationHeader: ({ onBack }: { onBack: () => void }) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: '返回',
        onPress: onBack,
      }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#00f',
    useRuntimeThemeColors: () => ({ background: '#fff', primary: '#00f' }),
  };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuestionId = '42';
  mockSessionVersion = 1;
  mockColorScheme = 'light';
  mockSyncCookies.mockReset().mockResolvedValue(undefined);
});

test('loads the requested question log after synchronizing the selected native session', async () => {
  let complete: (() => void) | undefined;
  mockSyncCookies.mockImplementation(
    () => new Promise((resolve) => (complete = resolve)),
  );
  const host = await render(<QuestionLogScreen />);
  expect(host.queryByTestId('question-log-webview')).toBeNull();
  expect(mockSyncCookies).toHaveBeenCalledWith(mockAuthState.cookies);
  await act(() => complete?.());
  const webview = host.getByTestId('question-log-webview');
  expect(webview.props.source).toEqual({
    uri: 'https://www.zhihu.com/question/42/log',
  });
  expect(webview.props.sharedCookiesEnabled).toBe(true);
  await fireEvent.press(host.getByRole('button', { name: '返回' }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test.each(['error', 'httpError'])(
  '%s offers retry and reloads the log',
  async (event) => {
    const host = await render(<QuestionLogScreen />);
    const webview = await host.findByTestId('question-log-webview');
    await fireEvent(webview, event, {
      nativeEvent: {
        url: 'https://www.zhihu.com/question/42/log',
        statusCode: 500,
      },
    });
    expect(host.queryByTestId('question-log-webview')).toBeNull();
    expect(host.getByText('问题日志加载失败，请重试')).toBeTruthy();
    await fireEvent.press(host.getByText('重新加载'));
    await host.findByTestId('question-log-webview');
    expect(mockSyncCookies).toHaveBeenCalledTimes(2);
  },
);

test('a failed session synchronization can be retried without mounting a stale session', async () => {
  mockSyncCookies.mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await render(<QuestionLogScreen />);
  await host.findByText('问题日志加载失败，请重试');
  expect(host.queryByTestId('question-log-webview')).toBeNull();
  await fireEvent.press(host.getByText('重新加载'));
  await host.findByTestId('question-log-webview');
});

test('switching sessions unmounts the previous WebView until the new session is ready', async () => {
  const host = await render(<QuestionLogScreen />);
  const previousError = (await host.findByTestId('question-log-webview')).props
    .onError;
  let complete: (() => void) | undefined;
  mockSyncCookies.mockImplementation(
    () => new Promise((resolve) => (complete = resolve)),
  );
  mockSessionVersion = 2;
  await host.rerender(<QuestionLogScreen />);
  expect(host.queryByTestId('question-log-webview')).toBeNull();
  await act(() => complete?.());
  await host.findByTestId('question-log-webview');
  expect(mockSyncCookies).toHaveBeenCalledTimes(2);
  await act(() => previousError());
  expect(host.getByTestId('question-log-webview')).toBeTruthy();
});

test('obsolete session readiness cannot mount a WebView for the replacement session', async () => {
  const completions: Array<() => void> = [];
  mockSyncCookies.mockImplementation(
    () => new Promise((resolve) => completions.push(resolve)),
  );
  const host = await render(<QuestionLogScreen />);
  mockSessionVersion = 2;
  await host.rerender(<QuestionLogScreen />);
  await act(() => completions[0]());
  expect(host.queryByTestId('question-log-webview')).toBeNull();
  await act(() => completions[1]());
  await host.findByTestId('question-log-webview');
});

test.each(['loadEnd', 'error'] as const)(
  'an uncommitted route render does not swallow the current WebView %s event',
  async (event) => {
    let navigate: (id: string) => void = () => {};
    let suspendedRenders = 0;
    const neverReady = new Promise<void>(() => {});
    function PendingRoute({ id }: { id: string }) {
      if (id === '43') {
        suspendedRenders += 1;
        throw neverReady;
      }
      return null;
    }
    function RouteHost() {
      const [id, setId] = useState('42');
      useLayoutEffect(() => {
        navigate = setId;
      }, []);
      return (
        <mockQuestionRouteContext.Provider value={id}>
          <Suspense fallback={<Text>等待下一页</Text>}>
            <QuestionLogScreen />
            <PendingRoute id={id} />
          </Suspense>
        </mockQuestionRouteContext.Provider>
      );
    }
    const host = await render(<RouteHost />);
    const webview = await host.findByTestId('question-log-webview');
    await act(() => {
      startTransition(() => navigate('43'));
    });
    expect(suspendedRenders).toBeGreaterThan(0);
    expect(host.getByTestId('question-log-webview').props.source.uri).toBe(
      'https://www.zhihu.com/question/42/log',
    );
    expect(mockSyncCookies).toHaveBeenCalledTimes(1);
    await act(() => {
      if (event === 'loadEnd') webview.props.onLoadEnd();
      else webview.props.onError();
    });
    if (event === 'loadEnd') {
      expect(host.queryByLabelText('正在加载问题日志')).toBeNull();
      expect(host.getByTestId('question-log-webview')).toBeTruthy();
    } else {
      expect(host.getByText('问题日志加载失败，请重试')).toBeTruthy();
    }
    await act(() => navigate('42'));
  },
);

test('subresource HTTP errors do not obscure a loaded log', async () => {
  const host = await render(<QuestionLogScreen />);
  const webview = await host.findByTestId('question-log-webview');
  await fireEvent(webview, 'httpError', {
    nativeEvent: { url: 'https://www.zhihu.com/favicon.ico', statusCode: 404 },
  });
  expect(host.getByTestId('question-log-webview')).toBeTruthy();
});

test('uses the dark page theme and blocks unsafe navigation', async () => {
  mockColorScheme = 'dark';
  const host = await render(<QuestionLogScreen />);
  const webview = await host.findByTestId('question-log-webview');
  expect(webview.props.forceDarkOn).toBe(true);
  expect(webview.props.injectedJavaScript).toContain("'data-theme', 'dark'");
  const shouldLoad = webview.props.onShouldStartLoadWithRequest;
  expect(shouldLoad({ url: 'https://www.zhihu.com/question/42/log' })).toBe(
    true,
  );
  expect(shouldLoad({ url: 'about:blank' })).toBe(true);
  expect(shouldLoad({ url: 'https://zhihu.com.attacker.test/' })).toBe(false);
  expect(shouldLoad({ url: 'zhihu://question/42' })).toBe(false);
});

test('invalid question IDs never reach the WebView or cookie store', async () => {
  mockQuestionId = '../other';
  const host = await render(<QuestionLogScreen />);
  expect(host.getByText('问题不存在')).toBeTruthy();
  await waitFor(() => expect(mockSyncCookies).not.toHaveBeenCalled());
  expect(host.queryByTestId('question-log-webview')).toBeNull();
});
