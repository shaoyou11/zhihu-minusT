import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/constants/designTokens';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { contrastingText } from '@/utils/colorContrast';
import { getCachedImageSource } from '@/utils/imageSource';
import { BouncyButton } from './BouncyButton';
import { Text, useRuntimeThemeColors } from './Themed';

export interface HotItem {
  id: string;
  questionId: string;
  title: string;
  excerpt: string;
  image: string | null;
  hotValue: string;
  rank: number;
  answerCount?: number;
  labelArea?: {
    type: string;
    trend?: number;
    text?: string;
    night_color?: string;
    normal_color?: string;
  } | null;
}

const HotCardComponent = ({ item }: { item: HotItem }) => {
  const router = useRouter();
  const { cookies } = useAuthStore();
  const colorScheme = useColorScheme();
  const palette = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const { fontScale } = useWindowDimensions();
  const isGuest = !cookies;

  const rankBgColor =
    item.rank === 1
      ? colors.light.hotRankFirst
      : item.rank === 2
        ? colors.light.hotRankSecond
        : item.rank === 3
          ? colors.light.hotRankThird
          : palette.backgroundTertiary;
  const rankTextColor =
    item.rank <= 3 ? contrastingText(rankBgColor) : palette.textSecondary;

  const labelColor =
    colorScheme === 'dark'
      ? item.labelArea?.night_color || colors.light.hotLabel
      : item.labelArea?.normal_color || colors.light.hotLabel;
  const imageSource = useMemo(
    () => getCachedImageSource(item.image),
    [item.image],
  );
  const labelText =
    item.labelArea?.type === 'text' ? item.labelArea.text : undefined;
  const hasTrend = item.labelArea?.type === 'trend';
  const hasAnswerCount = (item.answerCount ?? 0) > 0;
  const hasMetadata = labelText || hasTrend || item.hotValue || hasAnswerCount;

  return (
    <BouncyButton
      accessibilityRole="button"
      onPress={() => {
        if (isGuest) {
          router.push({
            pathname: '/guest/detail',
            params: {
              item: JSON.stringify({
                id: item.id,
                title: item.title,
                excerpt: item.excerpt,
                image: item.image,
                hotValue: item.hotValue,
                rank: item.rank,
                type: 'questions',
              }),
            },
          });
        } else {
          router.push(`/question/${item.questionId}`);
        }
      }}
      style={[styles.card, { backgroundColor: palette.backgroundSecondary }]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.textColumn,
            // 窄屏或大字体时让配图换到下一行，保留标题的阅读宽度。
            { flexBasis: 180 * fontSizeScale * fontScale },
          ]}
        >
          <View style={styles.titleRow}>
            <View style={[styles.rankBadge, { backgroundColor: rankBgColor }]}>
              <Text
                style={[styles.rankText, { color: rankTextColor }]}
                numberOfLines={1}
              >
                {item.rank}
              </Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
          </View>
          {hasMetadata ? (
            <View style={styles.metadata}>
              {labelText ? (
                <View
                  style={[styles.label, { backgroundColor: `${labelColor}15` }]}
                >
                  <Text style={[styles.labelText, { color: labelColor }]}>
                    {labelText}
                  </Text>
                </View>
              ) : null}
              {hasTrend ? (
                <View
                  accessibilityLabel="热度上升"
                  accessible
                  style={[styles.label, { backgroundColor: `${labelColor}15` }]}
                >
                  <Ionicons name="trending-up" size={12} color={labelColor} />
                </View>
              ) : null}
              {item.hotValue ? (
                <Text
                  style={[
                    styles.metadataText,
                    { color: colors.light.hotLabel },
                  ]}
                >
                  {item.hotValue}
                </Text>
              ) : null}
              {hasAnswerCount ? (
                <Text type="secondary" style={styles.metadataText}>
                  {item.answerCount} 个回答
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {imageSource ? (
          <Animated.Image
            source={imageSource}
            sharedTransitionTag={`image-${item.id}`}
            style={styles.image}
            resizeMode="cover"
            accessible={false}
          />
        ) : null}
      </View>
    </BouncyButton>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    marginBottom: 12,
    marginHorizontal: 12,
    borderRadius: 14,
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 12,
  },
  textColumn: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rankBadge: {
    // 序号随字体和行高增长，不用固定尺寸裁切两位数或大字体。
    minWidth: 20,
    minHeight: 20,
    flexShrink: 0,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginTop: 2,
    borderRadius: 4,
  },
  // 显式传给 Themed.Text，确保它按实际字号和行高应用阅读偏好。
  rankText: {
    fontSize: 11,
    lineHeight: 16.5,
    fontWeight: '800',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 25.5,
    fontWeight: '700',
  },
  image: {
    width: 85,
    maxWidth: '100%',
    aspectRatio: 10 / 9,
    marginLeft: 'auto',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  label: {
    maxWidth: '100%',
    flexShrink: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metadataText: {
    maxWidth: '100%',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
  },
});

export const HotCard = React.memo(
  HotCardComponent,
  (previous, next) =>
    previous.item.id === next.item.id &&
    previous.item.questionId === next.item.questionId &&
    previous.item.title === next.item.title &&
    previous.item.excerpt === next.item.excerpt &&
    previous.item.image === next.item.image &&
    previous.item.hotValue === next.item.hotValue &&
    previous.item.rank === next.item.rank &&
    previous.item.answerCount === next.item.answerCount &&
    previous.item.labelArea?.type === next.item.labelArea?.type &&
    previous.item.labelArea?.text === next.item.labelArea?.text &&
    previous.item.labelArea?.trend === next.item.labelArea?.trend &&
    previous.item.labelArea?.normal_color ===
      next.item.labelArea?.normal_color &&
    previous.item.labelArea?.night_color === next.item.labelArea?.night_color,
);
HotCard.displayName = 'HotCard';
