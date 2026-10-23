import { useQuery } from '@tanstack/react-query';
import { Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { getZhihuVideoPlayback } from '@/api/zhihu/video';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import {
  type PlaybackSource,
  VideoPlayback,
} from '@/features/video/VideoPlayback';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { isPlayableVideoUrl } from '@/utils/zhihuVideo';

export default function VideoDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    source?: string;
    uri?: string;
  }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const kind = params.source ?? 'zvideo';
  const uri = typeof params.uri === 'string' ? params.uri : '';
  const title =
    typeof params.title === 'string' ? params.title.slice(0, 300) : '';
  const direct = kind === 'direct';
  const valid = direct
    ? id === 'direct' && isPlayableVideoUrl(uri)
    : (kind === 'lens' || kind === 'zvideo') && /^\d+$/.test(id);
  const primaryColor = useThemeColor({}, 'primary');
  const focused = useIsFocused();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const [attempt, setAttempt] = useState(0);
  const query = useQuery({
    queryKey: ['video-playback', sessionVersion, kind, id, attempt],
    queryFn: async ({ signal }) => {
      if (kind !== 'lens' && kind !== 'zvideo') throw new Error('视频地址无效');
      const detail = await getZhihuVideoPlayback(id, kind, { signal });
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录状态已变化');
      return detail;
    },
    enabled: valid && !direct && focused,
    // Signed playback URLs expire. Fetch them when opening, keep no inactive cache.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const retry = () => setAttempt((current) => current + 1);
  const sources: readonly PlaybackSource[] =
    direct && valid
      ? [
          {
            url: uri,
            format: /\.m3u8$/i.test(new URL(uri).pathname) ? 'hls' : 'mp4',
          },
        ]
      : (query.data?.sources ?? []);

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: title || query.data?.title || '视频' }} />
      {!valid ? (
        <View className="flex-1 items-center justify-center">
          <Text type="secondary">无效的视频地址</Text>
        </View>
      ) : !direct && query.isFetching ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : !direct && query.isError ? (
        <QueryErrorView message="视频信息加载失败" onRetry={retry} />
      ) : sources.length ? (
        <VideoPlayback
          key={`${sessionVersion}:${kind}:${id}:${attempt}:${direct ? uri : query.dataUpdatedAt}`}
          sources={sources}
          onRetry={retry}
        />
      ) : null}
    </View>
  );
}
