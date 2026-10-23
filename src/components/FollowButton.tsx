import {
  ActivityIndicator,
  type GestureResponderEvent,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';

interface FollowButtonProps {
  following: boolean;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  accessibilityLabel?: string;
  onPress: (event: GestureResponderEvent) => void;
  /** Placement only; the shared component owns colors and shape. */
  style?: StyleProp<ViewStyle>;
}

/** Reuses the answer author's existing quiet follow / outlined following style. */
export function FollowButton({
  following,
  loading = false,
  disabled = false,
  label = '关注',
  accessibilityLabel,
  onPress,
  style,
}: FollowButtonProps) {
  const background = useThemeColor({}, 'primaryTransparent');
  const link = useThemeColor({}, 'link');
  const secondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const foreground = following ? secondary : link;
  const unavailable = loading || disabled;

  return (
    <BouncyButton
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel || (following ? '取消关注' : label)
      }
      accessibilityState={{
        selected: following,
        busy: loading,
        disabled: unavailable,
      }}
      disabled={unavailable}
      onPress={onPress}
      style={[
        styles.button,
        style,
        {
          backgroundColor: following ? 'transparent' : background,
          borderColor: following ? border : 'transparent',
          borderWidth: 1,
          borderRadius: 20,
          opacity: disabled && !loading ? 0.5 : 1,
        },
      ]}
    >
      {loading && <ActivityIndicator size="small" color={foreground} />}
      <Text
        style={{
          fontSize: 14,
          lineHeight: 21,
          fontWeight: '700',
          color: foreground,
        }}
      >
        {following ? '已关注' : label}
      </Text>
    </BouncyButton>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 34,
    paddingHorizontal: 15,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
});
