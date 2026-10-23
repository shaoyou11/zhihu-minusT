import { useEvent } from 'expo';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { QueryErrorView } from '@/components/QueryErrorView';
import { useThemeColor, View } from '@/components/Themed';

export interface PlaybackSource {
  url: string;
  format: 'mp4' | 'hls';
}

interface VideoPlaybackProps {
  sources: readonly PlaybackSource[];
  onRetry: () => void;
}

function NativeVideo({
  source,
  onError,
}: {
  source: PlaybackSource;
  onError: () => void;
}) {
  const focused = useIsFocused();
  const primaryColor = useThemeColor({}, 'primary');
  const player = useVideoPlayer(
    {
      uri: source.url,
      contentType: source.format === 'hls' ? 'hls' : 'progressive',
    },
    (instance) => {
      instance.staysActiveInBackground = false;
      instance.audioMixingMode = 'doNotMix';
      instance.play();
    },
  );
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  useEffect(() => {
    if (status === 'error') onError();
  }, [status, onError]);

  useEffect(() => {
    if (!focused || AppState.currentState !== 'active') player.pause();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => subscription.remove();
  }, [focused, player]);

  return (
    <View style={styles.player}>
      <VideoView
        testID="native-video-player"
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        playsInline
        fullscreenOptions={{ enable: true }}
      />
      {status === 'loading' || status === 'idle' ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : null}
    </View>
  );
}

/** Each rendition owns its player; switching/unmounting releases its buffers. */
export function VideoPlayback({ sources, onRetry }: VideoPlaybackProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const handleError = useCallback(() => {
    setSourceIndex((current) =>
      current === sourceIndex ? current + 1 : current,
    );
  }, [sourceIndex]);
  const source = sources[sourceIndex];
  if (!source)
    return <QueryErrorView message="视频播放失败" onRetry={onRetry} />;
  return (
    <NativeVideo key={sourceIndex} source={source} onError={handleError} />
  );
}

const styles = StyleSheet.create({
  player: { flex: 1, width: '100%', backgroundColor: '#000000' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
