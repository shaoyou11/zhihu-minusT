import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/components/Themed';
import {
  parseStructuredContentPaging,
  ZhihuStructuredContent,
} from '@/features/rich-content';
import {
  mergeStructuredContentPages,
  structuredContentCases,
} from '@/features/rich-content/dev/structuredCases';

type Renderer = 'blocks' | 'native-v2';

export default function StructuredContentScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const primaryColor = useThemeColor({}, 'primary');
  const borderColor = useThemeColor({}, 'border');
  const [caseId, setCaseId] = useState(structuredContentCases[0].id);
  const [renderer, setRenderer] = useState<Renderer>('blocks');
  const [pageIndex, setPageIndex] = useState(0);
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [selectedLink, setSelectedLink] = useState('');
  const currentCase =
    structuredContentCases.find((item) => item.id === caseId) ??
    structuredContentCases[0];
  const content = useMemo(
    () =>
      mergeStructuredContentPages(currentCase.pages.slice(0, pageIndex + 1)),
    [currentCase, pageIndex],
  );
  const paging = useMemo(
    () => parseStructuredContentPaging(content.paging),
    [content.paging],
  );
  const hasNextPage =
    !paging.is_end && pageIndex + 1 < currentCase.pages.length;
  const rawJson = useMemo(() => JSON.stringify(content, null, 2), [content]);
  const selectCase = (nextCaseId: string) => {
    if (nextCaseId === caseId) return;
    setCaseId(nextCaseId);
    setPageIndex(0);
    setJsonExpanded(false);
    setSelectedLink('');
  };

  return (
    <ScrollView
      style={{ backgroundColor }}
      contentContainerStyle={[
        styles.screen,
        { paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Stack.Screen options={{ title: 'structured_content 渲染对照' }} />
      <Text style={[styles.title, { color: textColor }]}>
        结构化正文渲染对照
      </Text>
      <Text style={[styles.hint, { color: secondaryColor }]}>
        五组脱敏抓包案例保留真实正文结构；另有一个合成案例演示本地续页。
      </Text>
      <Text style={[styles.hint, { color: secondaryColor }]}>
        真实脱敏 JSON：正文与公式图片使用原公开资源地址；合成边界展示本地续页。
      </Text>

      <View style={styles.choices}>
        {structuredContentCases.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`案例 ${item.title}`}
            accessibilityState={{ selected: item.id === caseId }}
            onPress={() => selectCase(item.id)}
            style={[
              styles.choice,
              { borderColor: item.id === caseId ? primaryColor : borderColor },
            ]}
          >
            <Text
              style={{ color: item.id === caseId ? primaryColor : textColor }}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.hint, { color: secondaryColor }]}>
        {currentCase.hint}
      </Text>

      <View style={styles.choices}>
        {(
          [
            { id: 'blocks', title: '原生分段' },
            { id: 'native-v2', title: 'tiqian-super-mini 文本流' },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: renderer === item.id }}
            onPress={() => setRenderer(item.id)}
            style={[
              styles.choice,
              {
                borderColor: renderer === item.id ? primaryColor : borderColor,
              },
            ]}
          >
            <Text
              style={{ color: renderer === item.id ? primaryColor : textColor }}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[styles.panel, { backgroundColor: surfaceColor, borderColor }]}
      >
        <Text
          testID="structured-paging-status"
          style={{ color: secondaryColor }}
        >
          {`第 ${pageIndex + 1} / ${currentCase.pages.length} 页 · ${content.segments.length} 个分段 · is_end=${paging.is_end}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasNextPage }}
          disabled={!hasNextPage}
          onPress={() => setPageIndex((index) => index + 1)}
          style={styles.action}
        >
          <Text style={{ color: hasNextPage ? primaryColor : secondaryColor }}>
            {hasNextPage
              ? '加载本地下一页'
              : paging.is_end
                ? '本地正文已完整'
                : '原样本正文未完（未捕获续页）'}
          </Text>
        </Pressable>
      </View>

      <View
        style={[styles.panel, { backgroundColor: surfaceColor, borderColor }]}
      >
        <ZhihuStructuredContent
          key={currentCase.id}
          content={content}
          renderer={renderer}
          documentId={`structured-case:${currentCase.id}`}
          previewSegmentCount={3}
          resources={currentCase.resources}
          onLinkPress={setSelectedLink}
        />
      </View>
      {selectedLink ? (
        <Text selectable style={[styles.hint, { color: secondaryColor }]}>
          选中的合成链接：{selectedLink}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: jsonExpanded }}
        onPress={() => setJsonExpanded((expanded) => !expanded)}
        style={styles.action}
      >
        <Text style={{ color: primaryColor }}>
          {jsonExpanded ? '收起原始 JSON' : '展开原始 JSON'}
        </Text>
      </Pressable>
      {jsonExpanded ? (
        <Text
          testID="structured-raw-json"
          selectable
          style={[
            styles.json,
            { color: textColor, backgroundColor: surfaceColor },
          ]}
        >
          {rawJson}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 20 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  action: { minHeight: 44, justifyContent: 'center' },
  json: { fontFamily: 'monospace', fontSize: 11, lineHeight: 17, padding: 12 },
});
