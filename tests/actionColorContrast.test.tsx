import { fireEvent, render } from '@testing-library/react-native';
import { voteContent } from '../src/api/zhihu';
import { voteContent as voteContentDirect } from '../src/api/zhihu/voters';
import { DownvoteButton } from '../src/components/DownvoteButton';
import { LikeButton } from '../src/components/LikeButton';
import { AppDialog } from '../src/components/overlays/AppDialog';
import { resolveThemeColors } from '../src/constants/theme';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { contrastRatio } from '../src/utils/colorContrast';

let mockColorScheme: 'light' | 'dark' = 'light';

jest.mock('../src/api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('../src/api/zhihu/voters', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useSharedValue: (value: number) => ({ value }),
  withSequence: (...values: number[]) => values.at(-1),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
jest.mock('../src/components/VoteTriangle', () => ({
  VoteTriangle: ({ color }: { color: string }) => {
    const NativeText = jest.requireActual('react-native').Text;
    return (
      <NativeText testID="vote-icon" style={{ color }}>
        ▲
      </NativeText>
    );
  },
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: (props: import('react-native').PressableProps) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Pressable, {
        ...props,
        onPress: (event: import('react-native').GestureResponderEvent) => {
          void props.onPress?.(event);
        },
      }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'warm',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  })),
}));
jest.mock('../src/utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 48, bottom: 16, left: 0, right: 0 }),
}));

function currentPalette() {
  return resolveThemeColors(mockColorScheme, useSettingsStore.getState());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockColorScheme = 'light';
  useSettingsStore.setState({ primaryColor: '#ffffff' });
  jest.mocked(voteContent).mockImplementation(() => new Promise(() => {}));
  jest
    .mocked(voteContentDirect)
    .mockImplementation(() => new Promise(() => {}));
});

test.each([
  ['light', null, '#ffffff'],
  ['dark', null, '#ffffff'],
  ['light', '#0084ff', '#ffffff'],
  ['dark', '#0084ff', '#ffffff'],
  ['light', '#ffffff', '#000000'],
  ['dark', '#ffffff', '#000000'],
  ['light', '#eeee00', '#000000'],
  ['dark', '#eeee00', '#000000'],
  ['light', '#001144', '#ffffff'],
  ['dark', '#001144', '#ffffff'],
] as const)(
  'filled vote controls match their text, icons and pending spinners to %s fill %s',
  async (scheme, primaryColor, foreground) => {
    mockColorScheme = scheme;
    useSettingsStore.setState({ primaryColor });
    const palette = currentPalette();
    expect(palette.onPrimary).toBe(foreground);
    const like = await render(
      <LikeButton id="synthetic" count={5} voted={1} />,
    );
    expect(like.getByRole('button')).toHaveStyle({
      backgroundColor: palette.primary,
    });
    expect(like.getByText('5')).toHaveStyle({ color: palette.onPrimary });
    expect(like.getByTestId('vote-icon')).toHaveStyle({
      color: palette.onPrimary,
    });
    expect(
      contrastRatio(palette.onPrimary, palette.primary),
    ).toBeGreaterThanOrEqual(3);
    await fireEvent.press(like.getByRole('button'));
    expect(like.getByRole('button')).toBeDisabled();
    expect(
      like.container.queryAll((node) => node.type === 'ActivityIndicator')[0]
        .props.color,
    ).toBe(palette.onPrimary);
    await like.unmount();

    const downvote = await render(<DownvoteButton id="synthetic" voted={-1} />);
    expect(downvote.getByRole('button')).toHaveStyle({
      backgroundColor: palette.primary,
    });
    expect(downvote.getByTestId('vote-icon')).toHaveStyle({
      color: palette.onPrimary,
    });
    await fireEvent.press(downvote.getByRole('button'));
    expect(downvote.getByRole('button')).toBeDisabled();
    expect(
      downvote.container.queryAll(
        (node) => node.type === 'ActivityIndicator',
      )[0].props.color,
    ).toBe(palette.onPrimary);
    await downvote.unmount();
  },
);

test.each(['light', 'dark'] as const)(
  'destructive dialog actions use the foreground matched to their actual fill in %s',
  async (scheme) => {
    mockColorScheme = scheme;
    const palette = currentPalette();
    const host = await render(
      <AppDialog
        visible
        title="合成对话框"
        actions={[
          { label: '删除', variant: 'destructive', onPress: jest.fn() },
        ]}
      />,
    );
    expect(host.getByRole('button', { name: '删除' })).toHaveStyle({
      backgroundColor: palette.danger,
    });
    expect(host.getByText('删除')).toHaveStyle({ color: palette.onDanger });
    expect(
      contrastRatio(palette.onDanger, palette.danger),
    ).toBeGreaterThanOrEqual(4.5);
    await host.unmount();
  },
);
