import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';
import { copyToClipboard } from '@/utils/clipboard';
import {
  clearDiagnosticLogs,
  type DiagnosticLogSnapshot,
  formatDiagnosticLogsForExport,
  readDiagnosticLogs,
} from '@/utils/diagnosticLogs';
import { showToast } from '@/utils/toast';

export default function DiagnosticLogsScreen() {
  const insets = useSafeAreaInsets();
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'backgroundSecondary');
  const border = useThemeColor({}, 'controlBorder');
  const primary = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const danger = useThemeColor({}, 'danger');
  const [snapshot, setSnapshot] = useState<DiagnosticLogSnapshot | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [copying, setCopying] = useState(false);

  const refresh = useCallback(() => {
    try {
      setSnapshot(readDiagnosticLogs());
      setReadFailed(false);
    } catch {
      setSnapshot(null);
      setReadFailed(true);
    }
  }, []);

  useFocusEffect(refresh);

  const count = snapshot?.entries.length ?? 0;
  const exportText = snapshot ? formatDiagnosticLogsForExport(snapshot) : '';
  const canExport = count > 0 && !copying;
  const canClear =
    snapshot !== null &&
    (count > 0 || !snapshot.persistenceAvailable) &&
    !copying;

  const copyLogs = async () => {
    if (!canExport) return;
    setCopying(true);
    try {
      if (await copyToClipboard(exportText)) showToast('报错日志已复制');
    } catch {
      showToast('复制失败，请稍后重试');
    } finally {
      setCopying(false);
    }
  };

  const confirmClear = () => {
    Alert.alert('清空报错日志', '清空后无法恢复。需要反馈的日志请先复制。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          try {
            const cleared = clearDiagnosticLogs();
            refresh();
            showToast(
              cleared
                ? '报错日志已清空'
                : '已清除本次运行的日志，但无法确认历史文件已清除，请稍后重试',
            );
          } catch {
            showToast('清空失败，请稍后重试');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <Stack.Screen
        options={{ title: '报错日志', headerShadowVisible: false }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text type="secondary" style={styles.intro}>
          本页显示脱敏后的本机报错记录，你可以先查看，再复制到反馈中。本地记录不会自动上传；自动错误上报由“分享数据”开关单独控制。
        </Text>
        {snapshot && !snapshot.persistenceAvailable ? (
          <Text type="danger" style={styles.notice}>
            日志保存受限，部分记录可能仅保留于本次运行。
          </Text>
        ) : null}
        <View style={styles.actions}>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="复制报错日志"
            accessibilityState={{ disabled: !canExport, busy: copying }}
            disabled={!canExport}
            onPress={() => void copyLogs()}
            style={[
              styles.button,
              { backgroundColor: primary, opacity: canExport ? 1 : 0.5 },
            ]}
          >
            <Text style={[styles.buttonText, { color: onPrimary }]}>
              {copying ? '正在复制…' : '复制日志'}
            </Text>
          </BouncyButton>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="刷新报错日志"
            disabled={copying}
            onPress={refresh}
            style={[styles.button, { borderColor: border, borderWidth: 1 }]}
          >
            <Text style={styles.buttonText}>刷新</Text>
          </BouncyButton>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="清空报错日志"
            accessibilityState={{ disabled: !canClear }}
            disabled={!canClear}
            onPress={confirmClear}
            style={[
              styles.button,
              {
                borderColor: border,
                borderWidth: 1,
                opacity: canClear ? 1 : 0.5,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: danger }]}>清空</Text>
          </BouncyButton>
        </View>
        <View style={[styles.logCard, { backgroundColor: surface }]}>
          {readFailed ? (
            <>
              <Text style={styles.title}>读取日志失败</Text>
              <Text type="secondary">请点击“刷新”重试。</Text>
            </>
          ) : count === 0 ? (
            <>
              <Text style={styles.title}>暂无报错日志</Text>
              <Text type="secondary">
                发生错误后可重新打开此页查看。没有记录不代表没有发生系统级闪退。
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>最近 {count} 条报错</Text>
              <Text type="secondary" style={styles.notice}>
                较早的记录会自动清理。复制内容与下方预览一致。
              </Text>
              <Text selectable style={styles.logText}>
                {exportText}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  notice: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: 10,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
  logCard: { padding: 16, borderRadius: 12 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  logText: {
    fontSize: 12,
    lineHeight: 19,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
