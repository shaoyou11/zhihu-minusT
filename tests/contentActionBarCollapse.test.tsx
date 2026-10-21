import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { ContentActionBar } from '../components/ContentActionBar';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-blur', () => ({
  BlurView: jest.requireActual('react-native').View,
}));
jest.mock('../hooks/useReduceTransparency', () => ({
  useReduceTransparency: () => false,
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    backgroundSecondary: '#fff',
    contentBorder: '#eee',
    text: '#111',
  }),
}));
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

test('collapsed controls expose one expand action and preserve the mounted content actions', async () => {
  const onExpand = jest.fn();
  const progress = { value: 0 } as SharedValue<number>;
  const content = (visible = true) => (
    <ContentActionBar
      bottomInset={34}
      visible={visible}
      collapseProgress={progress}
      onExpand={onExpand}
      leading={
        <Pressable accessibilityLabel="赞同">
          <Text>1</Text>
        </Pressable>
      }
    />
  );
  const host = await render(content());
  expect(host.queryByLabelText('赞同')).not.toBeNull();
  expect(host.queryByLabelText('展开阅读操作栏')).toBeNull();
  progress.value = 1;
  await host.rerender(content());
  expect(host.queryByLabelText('赞同')).toBeNull();
  await fireEvent.press(host.getByLabelText('展开阅读操作栏'));
  expect(onExpand).toHaveBeenCalledTimes(1);
  expect(host.queryByText('1', { includeHiddenElements: true })).not.toBeNull();
  await host.rerender(content(false));
  expect(host.queryByLabelText('展开阅读操作栏')).toBeNull();
});

test('interaction expands without swallowing the content action', async () => {
  const onExpand = jest.fn();
  const onVote = jest.fn();
  const host = await render(
    <ContentActionBar
      bottomInset={34}
      collapseProgress={{ value: 0 } as SharedValue<number>}
      onExpand={onExpand}
      leading={
        <Pressable accessibilityLabel="赞同 1116" onPress={onVote}>
          <Text>1116</Text>
        </Pressable>
      }
    />,
  );
  await fireEvent(host.getByTestId('content-action-bar'), 'touchStart', {});
  await fireEvent.press(host.getByLabelText('赞同 1116'));
  expect(onExpand).toHaveBeenCalledTimes(1);
  expect(onVote).toHaveBeenCalledTimes(1);
});

test('oversized counts stay mounted and all actions can be reached by scrolling', async () => {
  const progress = { value: 0 } as SharedValue<number>;
  const content = () => (
    <ContentActionBar
      bottomInset={34}
      collapseProgress={progress}
      onExpand={jest.fn()}
      leading={<Text>123456789</Text>}
      trailing={
        <Pressable accessibilityLabel="更多">
          <Text>更多</Text>
        </Pressable>
      }
    />
  );
  const host = await render(content());
  await fireEvent(host.getByTestId('content-action-bar-intrinsic'), 'layout', {
    nativeEvent: { layout: { width: 2000, height: 48 } },
  });
  expect(
    host.getByTestId('content-action-bar-actions').props.scrollEnabled,
  ).toBe(true);
  expect(host.getByText('123456789')).toBeTruthy();
  expect(host.getByLabelText('更多')).toBeTruthy();
  await host.rerender(content());
  const viewport = host.getByTestId('content-action-bar-viewport');
  const width = StyleSheet.flatten(viewport.props.style).width;
  expect(typeof width).toBe('number');
  expect(width).toBeGreaterThan(48);
  progress.value = 1;
  await host.rerender(content());
  const hiddenViewport = host.getByTestId('content-action-bar-viewport', {
    includeHiddenElements: true,
  });
  expect(StyleSheet.flatten(hiddenViewport.props.style).width).toBe(width);
});

test('measuring a wider count updates the expanded width without a collapse feedback loop', async () => {
  const progress = { value: 0 } as SharedValue<number>;
  const content = () => (
    <ContentActionBar
      bottomInset={34}
      collapseProgress={progress}
      onExpand={jest.fn()}
    >
      <Text>1116</Text>
    </ContentActionBar>
  );
  const host = await render(content());
  const measure = async (width: number) => {
    await fireEvent(
      host.getByTestId('content-action-bar-intrinsic'),
      'layout',
      {
        nativeEvent: { layout: { width, height: 48 } },
      },
    );
    await host.rerender(content());
  };
  await measure(220);
  expect(
    StyleSheet.flatten(host.getByTestId('content-action-bar').props.style)
      .width,
  ).toBe(220);
  await measure(280);
  expect(
    StyleSheet.flatten(host.getByTestId('content-action-bar').props.style)
      .width,
  ).toBe(280);
  progress.value = 1;
  await host.rerender(content());
  progress.value = 0;
  await host.rerender(content());
  expect(
    StyleSheet.flatten(host.getByTestId('content-action-bar').props.style)
      .width,
  ).toBe(280);
});
