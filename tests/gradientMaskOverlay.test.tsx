import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { GradientMaskOverlay } from '../components/GradientMaskOverlay';
import { resolveThemeColors } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useThemeStore } from '../store/useThemeStore';

let mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('@react-native-masked-view/masked-view', () => ({
  __esModule: true,
  default: ({
    maskElement: _maskElement,
    ...props
  }: ViewProps & { maskElement: ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    return <View {...props} />;
  },
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: () => null,
}));
jest.mock('expo-blur', () => ({
  BlurView: (props: ViewProps) => {
    const { View } = jest.requireActual('react-native');
    return <View {...props} testID="safe-area-blur" />;
  },
}));
jest.mock('../store/useThemeStore', () => ({
  useThemeStore: jest
    .requireActual('zustand')
    .create(() => ({ isDark: false })),
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: '#0084ff',
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
  })),
}));

beforeEach(() => {
  mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
  useThemeStore.setState({ isDark: false });
  useSettingsStore.setState({
    primaryColor: '#0084ff',
    readingBackground: 'default',
    surfaceStyle: 'layered',
  });
});

test('the home status area uses the page surface without a second blur or tint, keeping the bottom treatment', async () => {
  const host = await render(
    <GradientMaskOverlay isDark={false} topEdge="page" />,
  );
  const assertPageSurface = (scheme: 'light' | 'dark') => {
    const surface = host.getByTestId('page-status-bar-surface');
    const expected = resolveThemeColors(scheme, useSettingsStore.getState());
    expect(surface).toHaveStyle({ backgroundColor: expected.background });
    expect(StyleSheet.flatten(surface.props.style).backgroundColor).not.toBe(
      expected.contentOverlayStrong,
    );
    // Covers the system icons without extending a separate layer into the tabs.
    expect(surface).toHaveStyle({ top: 0, height: mockInsets.top });
    expect(host.queryByTestId('top-safe-area-gradient')).toBeNull();
    expect(host.getByTestId('bottom-safe-area-gradient')).toBeTruthy();
    expect(host.getAllByTestId('safe-area-blur')).toHaveLength(1);
  };

  assertPageSurface('light');
  await act(() => useThemeStore.setState({ isDark: true }));
  await host.rerender(<GradientMaskOverlay isDark topEdge="page" />);
  assertPageSurface('dark');
  await act(() =>
    useSettingsStore.setState({
      primaryColor: '#a35c19',
      readingBackground: 'warm',
      surfaceStyle: 'flat',
    }),
  );
  assertPageSurface('dark');
  await act(() => useThemeStore.setState({ isDark: false }));
  await host.rerender(<GradientMaskOverlay isDark={false} topEdge="page" />);
  assertPageSurface('light');
});

test('default routes retain both edge gradients and can return to the home surface', async () => {
  const host = await render(<GradientMaskOverlay isDark={false} />);
  expect(host.queryByTestId('page-status-bar-surface')).toBeNull();
  expect(host.getByTestId('top-safe-area-gradient')).toBeTruthy();
  expect(host.getByTestId('bottom-safe-area-gradient')).toBeTruthy();
  expect(host.getAllByTestId('safe-area-blur')).toHaveLength(2);

  await host.rerender(<GradientMaskOverlay isDark={false} topEdge="page" />);
  expect(host.getByTestId('page-status-bar-surface')).toBeTruthy();
  expect(host.queryByTestId('top-safe-area-gradient')).toBeNull();
  expect(host.getByTestId('bottom-safe-area-gradient')).toBeTruthy();
});

test('safe-area changes resize coverage and an absent top inset adds no color layer', async () => {
  const host = await render(
    <GradientMaskOverlay isDark={false} topEdge="page" />,
  );
  mockInsets = { top: 20, bottom: 21, left: 0, right: 0 };
  await host.rerender(<GradientMaskOverlay isDark={false} topEdge="page" />);
  expect(host.getByTestId('page-status-bar-surface')).toHaveStyle({
    height: mockInsets.top,
  });

  mockInsets = { top: 0, bottom: 21, left: 0, right: 0 };
  await host.rerender(<GradientMaskOverlay isDark={false} topEdge="page" />);
  expect(host.queryByTestId('page-status-bar-surface')).toBeNull();
  expect(host.queryByTestId('top-safe-area-gradient')).toBeNull();
  expect(host.getByTestId('bottom-safe-area-gradient')).toBeTruthy();
});

test('reading overlays stop at the bottom safe area instead of covering the action bar', async () => {
  const host = await render(
    <GradientMaskOverlay isDark={false} bottomEdge="safe-area" />,
  );
  const assertBottomCoverage = () => {
    expect(host.getByTestId('bottom-safe-area-gradient')).toHaveStyle({
      bottom: 0,
      height: mockInsets.bottom,
    });
    expect(host.getByTestId('top-safe-area-gradient')).toBeTruthy();
  };
  assertBottomCoverage();

  mockInsets = { top: 20, bottom: 21, left: 0, right: 0 };
  await host.rerender(
    <GradientMaskOverlay isDark={false} bottomEdge="safe-area" />,
  );
  assertBottomCoverage();

  await host.rerender(<GradientMaskOverlay isDark={false} />);
  expect(
    StyleSheet.flatten(
      host.getByTestId('bottom-safe-area-gradient').props.style,
    ).height,
  ).toBeGreaterThan(mockInsets.bottom);

  mockInsets = { top: 20, bottom: 0, left: 0, right: 0 };
  await host.rerender(
    <GradientMaskOverlay isDark={false} bottomEdge="safe-area" />,
  );
  expect(host.queryByTestId('bottom-safe-area-gradient')).toBeNull();
});
