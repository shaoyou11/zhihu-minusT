import * as Clipboard from 'expo-clipboard';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { formatDiagnosticLogsForExport } from '@/utils/diagnosticLogs';
import { captureTelemetryException } from '@/utils/telemetry';

/** Expo Router mounts this outside the root layout and all of its providers. */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const lastReportedError = useRef<Error | null>(null);
  const [copying, setCopying] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [status, setStatus] = useState('');
  const dark = useColorScheme() === 'dark';
  const background = dark ? '#171717' : '#ffffff';
  const foreground = dark ? '#fafafa' : '#171717';
  const secondary = dark ? '#d4d4d4' : '#525252';

  useEffect(() => {
    if (lastReportedError.current === error) return;
    lastReportedError.current = error;
    try {
      captureTelemetryException(error, 'react-render');
    } catch {
      // Reporting must never prevent the recovery controls from rendering.
    }
  }, [error]);

  async function copyLogs() {
    setCopying(true);
    try {
      const copied = await Clipboard.setStringAsync(
        formatDiagnosticLogsForExport(),
      );
      setStatus(
        copied === false ? '复制失败，请重试。' : '已复制脱敏报错日志。',
      );
    } catch {
      setStatus('复制失败，请重试。');
    } finally {
      setCopying(false);
    }
  }

  async function retryPage() {
    setRetrying(true);
    setStatus('');
    try {
      await retry();
    } catch {
      setStatus('重试未成功，可以复制报错日志后重新打开应用。');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.panel}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: foreground }]}
        >
          页面出现异常
        </Text>
        <Text style={[styles.description, { color: secondary }]}>
          可以重试打开页面，或复制脱敏报错日志反馈给我们。
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          onPress={() => void retryPage()}
          style={[styles.button, { borderColor: foreground }]}
        >
          <Text style={[styles.buttonText, { color: foreground }]}>
            {retrying ? '正在重试…' : '重试页面'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={copying}
          onPress={() => void copyLogs()}
          style={[styles.button, { borderColor: secondary }]}
        >
          <Text style={[styles.buttonText, { color: foreground }]}>
            {copying ? '正在复制…' : '复制报错日志'}
          </Text>
        </Pressable>
        {status ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: secondary }]}
          >
            {status}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 64,
  },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  description: { fontSize: 16, lineHeight: 24 },
  button: {
    minHeight: 48,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '500' },
  status: { fontSize: 14, lineHeight: 22 },
});
