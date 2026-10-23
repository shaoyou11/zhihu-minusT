import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  View as RNView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { MarkdownText } from '@/components/MarkdownText';
import { Text, useThemeColor } from '@/components/Themed';
import {
  getReleaseHistory,
  type ReleaseHistoryItem,
} from '@/components/UpdateChecker';

function formatReleaseDate(value: string | null): string {
  if (!value) return '发布时间未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function ReleaseCard({
  expanded,
  onToggle,
  release,
}: {
  expanded: boolean;
  onToggle: () => void;
  release: ReleaseHistoryItem;
}) {
  const cardColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'controlBorder');
  const primaryColor = useThemeColor({}, 'primary');
  const notes = release.notes.trim() || '本次发布未提供更新说明。';
  const canExpand = notes.length > 180 || notes.split('\n').length > 4;
  const previewNotes = notes.split('\n').slice(0, 4).join('\n');

  return (
    <RNView
      style={[styles.releaseCard, { backgroundColor: cardColor, borderColor }]}
    >
      <RNView style={styles.releaseHeader}>
        <RNView style={styles.releaseHeadingCopy}>
          <Text style={styles.releaseTag}>{release.tag}</Text>
          {release.name !== release.tag ? (
            <Text type="secondary" style={styles.releaseName} numberOfLines={1}>
              {release.name}
            </Text>
          ) : null}
        </RNView>
        {release.prerelease ? (
          <RNView
            style={[
              styles.prereleaseBadge,
              { backgroundColor: `${primaryColor}18` },
            ]}
          >
            <Text style={[styles.prereleaseText, { color: primaryColor }]}>
              预发布
            </Text>
          </RNView>
        ) : null}
      </RNView>
      <Text type="secondary" style={styles.releaseDate}>
        {formatReleaseDate(release.publishedAt)}
      </Text>
      <RNView style={styles.releaseNotes}>
        <MarkdownText
          markdown={expanded || !canExpand ? notes : `${previewNotes}\n…`}
          compact
          muted
        />
      </RNView>
      <RNView style={styles.releaseActions}>
        {canExpand ? (
          <BouncyButton onPress={onToggle} style={styles.releaseAction}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={primaryColor}
            />
            <Text style={[styles.releaseActionText, { color: primaryColor }]}>
              {expanded ? '收起' : '展开'}
            </Text>
          </BouncyButton>
        ) : (
          <RNView />
        )}
        <BouncyButton
          onPress={() => void Linking.openURL(release.url)}
          style={styles.releaseAction}
        >
          <Text style={[styles.releaseActionText, { color: primaryColor }]}>
            GitHub
          </Text>
          <Ionicons name="open-outline" size={14} color={primaryColor} />
        </BouncyButton>
      </RNView>
    </RNView>
  );
}

export default function ReleaseHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [expandedReleases, setExpandedReleases] = useState<string[]>([]);
  const canvasColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'backgroundSecondary');
  const primaryColor = useThemeColor({}, 'primary');
  const {
    data: releases = [],
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['github-release-history'],
    queryFn: getReleaseHistory,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen
        options={{ title: '版本记录', headerShadowVisible: false }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <RNView style={styles.intro}>
          <RNView style={styles.introCopy}>
            <Text style={styles.title}>全部版本</Text>
            <Text type="secondary" style={styles.description}>
              {releases.length > 0
                ? `共 ${releases.length} 个公开的 GitHub Release`
                : '从 GitHub 获取历次发布的更新内容'}
            </Text>
          </RNView>
          <BouncyButton
            accessibilityLabel="刷新版本记录"
            disabled={isFetching}
            onPress={() => void refetch()}
            style={styles.refreshButton}
          >
            {isFetching && !isLoading ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={primaryColor} />
            )}
          </BouncyButton>
        </RNView>

        {isLoading ? (
          <RNView style={[styles.stateCard, { backgroundColor: cardColor }]}>
            <ActivityIndicator color={primaryColor} />
            <Text type="secondary" style={styles.stateText}>
              正在加载版本记录…
            </Text>
          </RNView>
        ) : isError ? (
          <RNView style={[styles.stateCard, { backgroundColor: cardColor }]}>
            <Text type="secondary" style={styles.stateText}>
              暂时无法加载版本记录
            </Text>
            <BouncyButton
              onPress={() => void refetch()}
              style={[styles.retryButton, { borderColor: primaryColor }]}
            >
              <Text style={[styles.retryText, { color: primaryColor }]}>
                重试
              </Text>
            </BouncyButton>
          </RNView>
        ) : releases.length > 0 ? (
          <RNView style={styles.releaseList}>
            {releases.map((release) => (
              <ReleaseCard
                key={release.tag}
                release={release}
                expanded={expandedReleases.includes(release.tag)}
                onToggle={() =>
                  setExpandedReleases((current) =>
                    current.includes(release.tag)
                      ? current.filter((tag) => tag !== release.tag)
                      : [...current, release.tag],
                  )
                }
              />
            ))}
          </RNView>
        ) : (
          <RNView style={[styles.stateCard, { backgroundColor: cardColor }]}>
            <Text type="secondary" style={styles.stateText}>
              暂无公开的版本记录
            </Text>
          </RNView>
        )}
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  introCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 20, marginTop: 5 },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  releaseList: { gap: 12 },
  releaseCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  releaseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  releaseHeadingCopy: { flex: 1 },
  releaseTag: { fontSize: 17, fontWeight: '700' },
  releaseName: { fontSize: 12, marginTop: 2 },
  prereleaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  prereleaseText: { fontSize: 10, fontWeight: '700' },
  releaseDate: { fontSize: 11, marginTop: 8 },
  releaseNotes: { fontSize: 13, lineHeight: 20, marginTop: 12 },
  releaseActions: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  releaseAction: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  releaseActionText: { fontSize: 12, fontWeight: '600' },
  stateCard: {
    minHeight: 140,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: { fontSize: 13 },
  retryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryText: { fontSize: 12, fontWeight: '600' },
});
