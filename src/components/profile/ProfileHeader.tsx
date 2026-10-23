import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ZhihuMember } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FollowButton } from '@/components/FollowButton';
import { ProfileCover } from '@/components/profile/ProfileCover';
import { StableAvatar } from '@/components/StableAvatar';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PROFILE_COVER_SCROLL_DISTANCE } from '@/utils/profileScroll';

interface ProfileHeaderProps {
  user: ZhihuMember;
  initialAvatar?: string;
  isMe: boolean;
  followLoading: boolean;
  topInset: number;
  onFollow: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onMutual: () => void;
}

function formatCount(value: number | undefined): string {
  const count = Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
  if (count >= 100_000_000) {
    return `${(count / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (count >= 10_000) {
    return `${(count / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(Math.floor(count));
}

/** The caller measures this whole header, including any expanded biography. */
export function ProfileHeader({
  user,
  initialAvatar,
  isMe,
  followLoading,
  topInset,
  onFollow,
  onFollowers,
  onFollowing,
  onMutual,
}: ProfileHeaderProps) {
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);
  const styles = useMemo(
    () => createStyles(fontSizeScale, lineHeightScale),
    [fontSizeScale, lineHeightScale],
  );
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const identity = user.id || user.url_token || '';
  const isExpanded = expandedProfile === identity;
  const headline = user.headline?.trim();
  const description = user.description?.trim();
  const hasDescription = !!description && description !== headline;
  const canExpandDescription =
    !!description &&
    (description.length > 110 || description.split('\n').length > 3);
  const avatarUri = user.avatar_url || initialAvatar;

  return (
    <View
      pointerEvents="box-none"
      style={{ backgroundColor: colors.background }}
    >
      <ProfileCover
        coverUrl={user.cover_url}
        height={topInset + PROFILE_COVER_SCROLL_DISTANCE}
      />

      <View pointerEvents="box-none" style={styles.body}>
        <View pointerEvents="box-none" style={styles.identityRow}>
          <View
            pointerEvents="none"
            style={[
              styles.avatarFrame,
              {
                borderColor: colors.background,
                backgroundColor: colors.backgroundSecondary,
              },
            ]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${user.name || '用户'}的头像`}
          >
            {avatarUri ? (
              <StableAvatar uri={avatarUri} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={34} color={colors.textTertiary} />
            )}
          </View>
          {!isMe && (
            <FollowButton
              following={Boolean(user.is_following)}
              loading={followLoading}
              accessibilityLabel={
                user.is_following
                  ? `取消关注${user.name || '用户'}`
                  : `关注${user.name || '用户'}`
              }
              onPress={onFollow}
              style={{ minHeight: 40, marginBottom: 2 }}
            />
          )}
        </View>

        <Text
          pointerEvents="none"
          style={[styles.name, { color: colors.text }]}
        >
          {user.name}
        </Text>
        {!!user.url_token && (
          <Text
            pointerEvents="none"
            style={[styles.handle, { color: colors.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            @{user.url_token}
          </Text>
        )}
        {!!headline && (
          <Text
            pointerEvents="none"
            style={[styles.headline, { color: colors.text }]}
          >
            {headline}
          </Text>
        )}
        {hasDescription && (
          <View pointerEvents="box-none" style={styles.descriptionBlock}>
            <Text
              pointerEvents="none"
              style={[styles.description, { color: colors.textSecondary }]}
              numberOfLines={
                canExpandDescription && !isExpanded ? 3 : undefined
              }
            >
              {description}
            </Text>
            {canExpandDescription && (
              <BouncyButton
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                onPress={() => setExpandedProfile(isExpanded ? null : identity)}
                style={styles.expandButton}
              >
                <Text style={[styles.expandText, { color: colors.link }]}>
                  {isExpanded ? '收起简介' : '展开简介'}
                </Text>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color={colors.link}
                />
              </BouncyButton>
            )}
          </View>
        )}

        <View pointerEvents="box-none" style={styles.stats}>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel={`${user.following_count || 0} 关注`}
            onPress={onFollowing}
            style={styles.stat}
          >
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatCount(user.following_count)}
              </Text>{' '}
              关注
            </Text>
          </BouncyButton>
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel={`${user.follower_count || 0} 关注者`}
            onPress={onFollowers}
            style={styles.stat}
          >
            <Text style={[styles.statText, { color: colors.textSecondary }]}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatCount(user.follower_count)}
              </Text>{' '}
              关注者
            </Text>
          </BouncyButton>
          <View pointerEvents="none" style={styles.stat}>
            <Text
              style={[styles.statText, { color: colors.textSecondary }]}
              accessibilityLabel={`${user.voteup_count || 0} 获赞`}
            >
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatCount(user.voteup_count)}
              </Text>{' '}
              获赞
            </Text>
          </View>
        </View>

        {!isMe && (user.mutual_followees_count || 0) > 0 && (
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel={`${user.mutual_followees_count} 位共同关注`}
            onPress={onMutual}
            style={styles.mutual}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.mutualText, { color: colors.textSecondary }]}>
              {formatCount(user.mutual_followees_count)} 位共同关注
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={colors.textTertiary}
            />
          </BouncyButton>
        )}
      </View>
    </View>
  );
}

function createStyles(fontScale: number, lineHeightScale: number) {
  const type = (fontSize: number, lineHeight: number) => ({
    fontSize: fontSize * fontScale,
    lineHeight: (lineHeight * fontScale * lineHeightScale) / 1.5,
  });
  return StyleSheet.create({
    body: { paddingHorizontal: 20, paddingBottom: 6 },
    identityRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
      marginTop: -40,
      marginBottom: 10,
    },
    avatarFrame: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 4,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    avatar: { width: 80, height: 80, borderRadius: 40 },
    name: { ...type(24, 30), fontWeight: '800', letterSpacing: -0.4 },
    handle: { ...type(13, 18), marginTop: 2 },
    headline: { ...type(14, 22), marginTop: 10 },
    descriptionBlock: { marginTop: 7 },
    description: type(13, 20),
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      minHeight: 40,
    },
    expandText: type(12, 18),
    stats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 18,
      marginTop: 5,
    },
    stat: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
    statText: type(13, 20),
    statValue: { fontWeight: '700' },
    mutual: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: 40,
      gap: 6,
      paddingVertical: 5,
    },
    mutualText: { ...type(12, 18), flexShrink: 1 },
  });
}
