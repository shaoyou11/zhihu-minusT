import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import type { UpdateDownloadState } from '@/hooks/useUpdateDownload';
import { readableColor } from '@/utils/colorContrast';

interface UpdateDownloadBarProps {
  state: UpdateDownloadState;
  onCancel: () => void;
  onDismiss: () => void;
  onInstall: () => void;
  onRetry: () => void;
}

/** Only the card receives touches; the surrounding route remains interactive. */
export function UpdateDownloadBar({
  state,
  onCancel,
  onDismiss,
  onInstall,
  onRetry,
}: UpdateDownloadBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useRuntimeThemeColors();
  const backgroundColor = colors.toastSurface;
  const textColor = readableColor(colors.text, [backgroundColor]);
  const actionColor = readableColor(colors.link, [backgroundColor]);
  const busy =
    state.phase === 'verifying' ||
    state.phase === 'installing' ||
    state.phase === 'cancelling';
  const title =
    state.phase === 'downloading'
      ? `正在下载更新 ${state.update.tag} · ${(state.progress * 100).toFixed(1)}%`
      : state.phase === 'verifying'
        ? '正在校验更新'
        : state.phase === 'ready'
          ? `更新 ${state.update.tag} 已就绪`
          : state.phase === 'installing'
            ? '正在打开安装程序'
            : state.phase === 'cancelling'
              ? '正在取消下载'
              : state.message;
  const hint =
    state.phase === 'ready'
      ? '校验已通过，点击安装以继续'
      : state.phase === 'downloading' || state.phase === 'verifying'
        ? '可继续浏览，完成后点击安装'
        : undefined;

  return (
    <View
      testID="update-download-overlay"
      pointerEvents="box-none"
      style={[styles.container, { bottom: insets.bottom + 80 }]}
    >
      <View style={[styles.card, { backgroundColor }]}>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            {busy ? (
              <ActivityIndicator
                size="small"
                color={textColor}
                style={styles.spinner}
              />
            ) : null}
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.title, { color: textColor }]}
            >
              {title}
            </Text>
          </View>
          {hint ? (
            <Text style={[styles.hint, { color: textColor }]}>{hint}</Text>
          ) : null}
          {state.phase === 'downloading' ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="更新下载进度"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: state.progress * 100,
              }}
              style={[styles.track, { backgroundColor: colors.border }]}
            >
              <View
                style={[
                  styles.progress,
                  {
                    width: `${state.progress * 100}%`,
                    backgroundColor: actionColor,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {state.phase === 'downloading' || state.phase === 'verifying' ? (
            <BouncyButton
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.action}
            >
              <Text style={[styles.actionText, { color: actionColor }]}>
                取消
              </Text>
            </BouncyButton>
          ) : null}
          {state.phase === 'ready' || state.phase === 'failed' ? (
            <>
              <BouncyButton
                accessibilityRole="button"
                onPress={state.phase === 'ready' ? onInstall : onRetry}
                style={styles.action}
              >
                <Text style={[styles.actionText, { color: actionColor }]}>
                  {state.phase === 'ready' ? '安装' : '重试'}
                </Text>
              </BouncyButton>
              <BouncyButton
                accessibilityRole="button"
                onPress={onDismiss}
                style={styles.action}
              >
                <Text style={[styles.actionText, { color: textColor }]}>
                  关闭
                </Text>
              </BouncyButton>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 99998,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
  },
  content: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '600', flex: 1 },
  spinner: { marginRight: 8 },
  hint: { fontSize: 12, marginTop: 4 },
  track: { height: 4, marginTop: 12, borderRadius: 2, overflow: 'hidden' },
  progress: { height: '100%' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  action: { minHeight: 44, minWidth: 52, justifyContent: 'center', padding: 8 },
  actionText: { fontSize: 14, fontWeight: '600' },
});
