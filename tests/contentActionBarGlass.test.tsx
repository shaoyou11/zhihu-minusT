import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { ContentActionBar } from '../src/components/ContentActionBar';

jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { View: jest.requireActual('react-native').View },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    Extrapolation: { CLAMP: 'clamp' },
    ReduceMotion: { System: 'system' },
    withTiming: (value: number) => value,
    interpolate: (value: number, input: number[], output: number[]) => {
      const t = Math.max(
        0,
        Math.min(1, (value - input[0]) / (input[1] - input[0])),
      );
      return output[0] + (output[1] - output[0]) * t;
    },
    useAnimatedStyle: (compute: () => object) => compute(),
    useAnimatedReaction: (
      prepare: () => boolean,
      reaction: (value: boolean, previous: null) => void,
    ) => {
      const value = prepare();
      react.useEffect(() => reaction(value, null), [value]);
    },
    runOnJS: <T,>(callback: T) => callback,
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/features/adaptive-layout/PaneContext', () => ({
  usePaneDimensions: () => ({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/hooks/useReduceTransparency', () => ({
  useReduceTransparency: () => false,
}));
jest.mock('expo-glass-effect', () => ({
  GlassContainer: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/surfaces/FloatingSurface', () => ({
  useIsLiquidGlassActive: () => true,
  FloatingSurface: ({
    isInteractive,
    children,
  }: {
    isInteractive?: boolean;
    children: React.ReactNode;
  }) => {
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View testID={isInteractive ? 'interactive-glass' : 'static-glass'}>
        {children}
      </View>
    );
  },
}));
jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    contentOverlayStrong: '#fff',
    contentBorder: '#ddd',
    shadow: '#000',
  }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

test('interactive glass applies to action groups and the collapse control without intercepting their buttons', async () => {
  const onVote = jest.fn();
  const onComment = jest.fn();
  const onCollapse = jest.fn();
  const host = await render(
    <ContentActionBar
      bottomInset={0}
      variant="islands"
      interactiveGlass
      leading={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="赞同"
          onPress={onVote}
        >
          <Text>赞同</Text>
        </Pressable>
      }
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="评论"
          onPress={onComment}
        >
          <Text>评论</Text>
        </Pressable>
      }
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="收起"
          onPress={onCollapse}
        >
          <Text>收起</Text>
        </Pressable>
      }
    />,
  );

  expect(host.getAllByTestId('interactive-glass')).toHaveLength(3);
  await fireEvent.press(host.getByRole('button', { name: '赞同' }));
  await fireEvent.press(host.getByRole('button', { name: '评论' }));
  await fireEvent.press(host.getByRole('button', { name: '收起' }));
  expect(onVote).toHaveBeenCalledTimes(1);
  expect(onComment).toHaveBeenCalledTimes(1);
  expect(onCollapse).toHaveBeenCalledTimes(1);
});
