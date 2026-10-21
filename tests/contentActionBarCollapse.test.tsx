import { fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
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
