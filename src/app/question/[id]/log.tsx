import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  DetailNavigationHeader,
  useDetailNavigationHeight,
} from '@/components/DetailNavigationHeader';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { syncNativeSessionCookies } from '@/utils/authSession';

export default function QuestionLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigationHeight = useDetailNavigationHeight();
  const colors = useRuntimeThemeColors();
  const colorScheme = useColorScheme();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${id}:${sessionVersion}:${attempt}`;
  const activeRequestKey = useRef(requestKey);
  useLayoutEffect(() => {
    activeRequestKey.current = requestKey;
  }, [requestKey]);
  const [session, setSession] = useState<{
    key: string;
    status: 'preparing' | 'ready' | 'error';
  }>({ key: requestKey, status: 'preparing' });
  const [loading, setLoading] = useState(true);
  const validId = typeof id === 'string' && /^\d+$/.test(id);
  const logUrl = `https://www.zhihu.com/question/${id}/log`;
  const mainFrameUrl = useRef(logUrl);
  const themeScript = `document.documentElement.setAttribute('data-theme', '${colorScheme}'); document.documentElement.style.colorScheme = '${colorScheme}'; true;`;

  useEffect(() => {
    if (!validId) return;
    let active = true;
    setSession({ key: requestKey, status: 'preparing' });
    setLoading(true);
    mainFrameUrl.current = logUrl;
    syncNativeSessionCookies(useAuthStore.getState().cookies).then(
      () => {
        if (active) setSession({ key: requestKey, status: 'ready' });
      },
      () => {
        if (active) setSession({ key: requestKey, status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [requestKey, validId, logUrl]);

  const status = session.key === requestKey ? session.status : 'preparing';
  const failLoading = () => {
    if (activeRequestKey.current !== requestKey) return;
    setLoading(false);
    setSession({ key: requestKey, status: 'error' });
  };

  return (
    <SafeAreaView
      edges={['bottom']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <Stack.Screen options={{ headerShown: false, title: '问题日志' }} />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <DetailNavigationHeader
        title="问题日志"
        collapsed
        onBack={() => router.back()}
      />
      <View style={{ flex: 1, marginTop: insets.top + navigationHeight }}>
        {!validId ? (
          <Text type="secondary" className="p-8 text-center">
            问题不存在
          </Text>
        ) : status === 'error' ? (
          <QueryErrorView
            message="问题日志加载失败，请重试"
            onRetry={() => setAttempt((current) => current + 1)}
          />
        ) : status === 'ready' ? (
          <WebView
            key={requestKey}
            testID="question-log-webview"
            source={{ uri: logUrl }}
            style={{ flex: 1, backgroundColor: colors.background }}
            sharedCookiesEnabled
            domStorageEnabled
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            forceDarkOn={colorScheme === 'dark'}
            injectedJavaScriptBeforeContentLoaded={themeScript}
            injectedJavaScript={themeScript}
            onShouldStartLoadWithRequest={({ url }) => {
              if (url === 'about:blank') return true;
              try {
                const parsed = new URL(url);
                return (
                  parsed.protocol === 'https:' &&
                  (parsed.hostname === 'zhihu.com' ||
                    parsed.hostname.endsWith('.zhihu.com'))
                );
              } catch {
                return false;
              }
            }}
            onLoadStart={({ nativeEvent }) => {
              if (activeRequestKey.current !== requestKey) return;
              mainFrameUrl.current = nativeEvent.url;
              setLoading(true);
            }}
            onLoadEnd={() => {
              if (activeRequestKey.current === requestKey) setLoading(false);
            }}
            onError={failLoading}
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.url === mainFrameUrl.current) failLoading();
            }}
          />
        ) : null}
        {validId && status !== 'error' && loading ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 16, alignSelf: 'center' }}
          >
            <ActivityIndicator
              color={colors.primary}
              accessibilityLabel="正在加载问题日志"
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
