import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getZhihuVideoPlayback,
  type ZhihuVideoDetail,
} from '../src/api/zhihu/video';
import VideoDetailScreen from '../src/app/video/[id]';
import { VideoPlayback } from '../src/features/video/VideoPlayback';

type MockPlayerStatus = 'idle' | 'loading' | 'readyToPlay' | 'error';
interface MockStatusEvent {
  status: MockPlayerStatus;
  error?: { message: string };
}
interface MockPlayer {
  source: { uri: string; contentType: string };
  status: MockPlayerStatus;
  staysActiveInBackground: boolean;
  audioMixingMode: string;
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
  addListener: (
    name: string,
    listener: (event: MockStatusEvent) => void,
  ) => { remove: () => void };
  emit: (event: MockStatusEvent) => void;
}

const mockPlayers: MockPlayer[] = [];
let mockFocused = true;
let mockParams: { id: string; source?: string; uri?: string; title?: string } =
  {
    id: '42',
    source: 'lens',
  };
const mockWebView = jest.fn(() => null);

jest.mock('../src/api/zhihu/video', () => ({
  getZhihuVideoPlayback: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => 1,
  useAuthStore: (selector: () => unknown) => selector(),
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#345678',
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-webview', () => ({
  __esModule: true,
  default: () => mockWebView(),
  WebView: () => mockWebView(),
}));
jest.mock('expo-video', () => ({
  VideoView: jest.requireActual('react-native').View,
  useVideoPlayer: (
    source: { uri: string; contentType: string },
    setup: (mockInstance: MockPlayer) => void,
  ) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [player] = React.useState(() => {
      const listeners = new Set<(mockEvent: MockStatusEvent) => void>();
      const instance: MockPlayer = {
        source,
        status: 'readyToPlay',
        staysActiveInBackground: true,
        audioMixingMode: 'auto',
        play: jest.fn(),
        pause: jest.fn(),
        release: jest.fn(),
        addListener: (_name, listener) => {
          listeners.add(listener);
          return { remove: () => listeners.delete(listener) };
        },
        emit: (event) => {
          instance.status = event.status;
          for (const listener of listeners) listener(event);
        },
      };
      mockPlayers.push(instance);
      setup(instance);
      return instance;
    });
    React.useEffect(() => () => player.release(), [player]);
    return player;
  },
}));
jest.mock('expo', () => ({
  useEvent: (player: MockPlayer, name: string, initial: MockStatusEvent) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [event, setEvent] = React.useState(initial);
    React.useEffect(() => {
      const subscription = player.addListener(name, setEvent);
      return () => subscription.remove();
    }, [player, name]);
    return event;
  },
}));

const appStateListeners = new Set<(state: AppStateStatus) => void>();
const initialAppState = AppState.currentState;
const mockedGetPlayback = jest.mocked(getZhihuVideoPlayback);
const firstUrl = 'https://example.com/first.mp4?version=synthetic';
const secondUrl = 'https://example.com/second.mp4?version=synthetic';

function detail(urls: string[]): ZhihuVideoDetail {
  return {
    id: '42',
    title: '合成视频',
    sources: urls.map((url) => ({
      url,
      format: 'mp4',
      quality: 'HD',
      playlist: 'playlist',
    })),
  };
}

async function screen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = await render(
    <QueryClientProvider client={client}>
      <VideoDetailScreen />
    </QueryClientProvider>,
  );
  return { host, client };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetPlayback.mockReset();
  mockPlayers.length = 0;
  mockFocused = true;
  mockParams = { id: '42', source: 'lens' };
  AppState.currentState = 'active';
  appStateListeners.clear();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateListeners.add(listener);
      return { remove: () => appStateListeners.delete(listener) };
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  AppState.currentState = initialAppState;
});

test('renders the native video view with controls, inline playback and fullscreen', async () => {
  const host = await render(
    <VideoPlayback
      sources={[{ url: firstUrl, format: 'mp4' }]}
      onRetry={jest.fn()}
    />,
  );
  const view = host.getByTestId('native-video-player');
  expect(view.props.nativeControls).toBe(true);
  expect(view.props.playsInline).toBe(true);
  expect(view.props.fullscreenOptions).toEqual({ enable: true });
  expect(mockPlayers[0].source).toEqual({
    uri: firstUrl,
    contentType: 'progressive',
  });
  expect(mockPlayers[0].staysActiveInBackground).toBe(false);
  expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  expect(mockWebView).not.toHaveBeenCalled();
  await host.unmount();
});

test('tries each rendition in order, releases failed players and shows fixed feedback after exhaustion', async () => {
  const retry = jest.fn();
  const host = await render(
    <VideoPlayback
      sources={[
        { url: firstUrl, format: 'mp4' },
        { url: secondUrl, format: 'hls' },
      ]}
      onRetry={retry}
    />,
  );
  const first = mockPlayers[0];
  await act(() =>
    first.emit({ status: 'error', error: { message: `Failed ${firstUrl}` } }),
  );
  expect(mockPlayers.map(({ source }) => source.uri)).toEqual([
    firstUrl,
    secondUrl,
  ]);
  expect(first.release).toHaveBeenCalledTimes(1);
  expect(mockPlayers[1].source.contentType).toBe('hls');
  expect(host.getByTestId('native-video-player').props.player).toBe(
    mockPlayers[1],
  );

  await act(() =>
    mockPlayers[1].emit({
      status: 'error',
      error: { message: `Failed ${secondUrl}` },
    }),
  );
  expect(host.queryByTestId('native-video-player')).toBeNull();
  expect(host.getByText('视频播放失败')).toBeTruthy();
  expect(host.queryByText(/example\.com/)).toBeNull();
  expect(mockPlayers[1].release).toHaveBeenCalledTimes(1);
  await fireEvent.press(host.getByText('重新加载'));
  expect(retry).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('pauses when the page loses focus or the app enters the background and removes listeners', async () => {
  const sources = [{ url: firstUrl, format: 'mp4' }] as const;
  const retry = jest.fn();
  const host = await render(
    <VideoPlayback sources={sources} onRetry={retry} />,
  );
  const player = mockPlayers[0];
  expect(player.pause).not.toHaveBeenCalled();

  mockFocused = false;
  await host.rerender(<VideoPlayback sources={sources} onRetry={retry} />);
  expect(player.pause).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await host.rerender(<VideoPlayback sources={sources} onRetry={retry} />);
  await act(() => {
    AppState.currentState = 'background';
    for (const listener of appStateListeners) listener('background');
  });
  expect(player.pause).toHaveBeenCalledTimes(2);
  await host.unmount();
  expect(appStateListeners.size).toBe(0);
  expect(player.release).toHaveBeenCalledTimes(1);
});

test('API failure retry fetches new runtime resources and never displays raw errors', async () => {
  mockedGetPlayback
    .mockRejectedValueOnce(new Error(`Request failed for ${firstUrl}`))
    .mockResolvedValueOnce(detail([secondUrl]));
  const { host, client } = await screen();
  await waitFor(() => expect(host.getByText('视频信息加载失败')).toBeTruthy());
  expect(host.queryByText(/example\.com/)).toBeNull();
  await fireEvent.press(host.getByText('重新加载'));
  await waitFor(() =>
    expect(host.getByTestId('native-video-player')).toBeTruthy(),
  );
  expect(mockedGetPlayback).toHaveBeenCalledTimes(2);
  expect(mockedGetPlayback).toHaveBeenLastCalledWith('42', 'lens', {
    signal: expect.any(AbortSignal),
  });
  expect(mockPlayers[0].source.uri).toBe(secondUrl);
  await host.unmount();
  client.clear();
});

test('retry after all native renditions fail refreshes signed resources and restarts playback', async () => {
  mockedGetPlayback
    .mockResolvedValueOnce(detail([firstUrl]))
    .mockResolvedValueOnce(detail([secondUrl]));
  const { host, client } = await screen();
  await waitFor(() =>
    expect(host.getByTestId('native-video-player')).toBeTruthy(),
  );
  await act(() => mockPlayers[0].emit({ status: 'error' }));
  expect(host.getByText('视频播放失败')).toBeTruthy();
  await fireEvent.press(host.getByText('重新加载'));
  await waitFor(() => expect(mockPlayers[1]?.source.uri).toBe(secondUrl));
  expect(host.getByTestId('native-video-player').props.player).toBe(
    mockPlayers[1],
  );
  expect(mockedGetPlayback).toHaveBeenCalledTimes(2);
  await host.unmount();
  client.clear();
});

test.each([
  '',
  'not-a-url',
  'javascript:synthetic.mp4',
  'file:///synthetic.mp4',
  'https://www.zhihu.com/video/42',
  'https://user:password@example.com/synthetic.mp4',
])(
  'an invalid direct URL does not crash, create a player or request metadata: %s',
  async (uri) => {
    mockParams = { id: 'direct', source: 'direct', uri };
    const { host, client } = await screen();
    expect(host.getByText('无效的视频地址')).toBeTruthy();
    expect(mockedGetPlayback).not.toHaveBeenCalled();
    expect(mockPlayers).toHaveLength(0);
    await host.unmount();
    client.clear();
  },
);

test('a direct HLS resource uses native playback without requesting Lens metadata', async () => {
  mockParams = {
    id: 'direct',
    source: 'direct',
    uri: 'https://example.com/stream.m3u8?version=synthetic',
  };
  const { host, client } = await screen();
  expect(host.getByTestId('native-video-player')).toBeTruthy();
  expect(mockPlayers[0].source.contentType).toBe('hls');
  expect(mockedGetPlayback).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('changing a direct URI on the same screen resets an exhausted player', async () => {
  mockParams = { id: 'direct', source: 'direct', uri: firstUrl };
  const { host, client } = await screen();
  await act(() => mockPlayers[0].emit({ status: 'error' }));
  expect(host.getByText('视频播放失败')).toBeTruthy();

  mockParams = { id: 'direct', source: 'direct', uri: secondUrl };
  await host.rerender(
    <QueryClientProvider client={client}>
      <VideoDetailScreen />
    </QueryClientProvider>,
  );

  expect(host.queryByText('视频播放失败')).toBeNull();
  expect(host.getByTestId('native-video-player').props.player).toBe(
    mockPlayers[1],
  );
  expect(mockPlayers[1].source.uri).toBe(secondUrl);
  expect(mockedGetPlayback).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});
