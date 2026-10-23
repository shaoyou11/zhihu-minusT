import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  Text as ThemedText,
  useRuntimeThemeColors,
} from '../src/components/Themed';
import Colors from '../src/constants/Colors';
import { colors } from '../src/constants/designTokens';
import {
  type ReadingBackground,
  type RuntimeThemeColors,
  resolveThemeColors,
  type ThemePreferences,
} from '../src/constants/theme';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { contrastRatio, rgbChannels } from '../src/utils/colorContrast';
import { themeVariables } from '../src/utils/themeVariables';

let mockColorScheme: 'light' | 'dark' = 'light';

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  })),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));

const presets: readonly ReadingBackground[] = [
  'default',
  'soft',
  'warm',
  'dim',
];
const seeds = [
  null,
  '#0084ff',
  '#d32f2f',
  '#008a51',
  '#2844c9',
  '#7e22ce',
  '#eeee00',
  '#ffffff',
  '#000000',
  '#777777',
  '#8f8f8f',
  '#909090',
  '#ff0000',
  '#00ff00',
  '#00ffff',
  'invalid',
] as const;
const neutralSurfaces = [
  'background',
  'backgroundSecondary',
  'backgroundTertiary',
  'surface',
  'controlBackground',
  'chatBubble',
] as const;
const textRoles = ['text', 'textSecondary', 'textTertiary', 'link'] as const;
const filledPairs = [
  ['onPrimary', 'primary'],
  ['onDanger', 'danger'],
  ['onSuccess', 'success'],
  ['onWarning', 'warning'],
] as const;

function preferences(
  overrides: Partial<ThemePreferences> = {},
): ThemePreferences {
  return {
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    ...overrides,
  };
}

function PaletteProbe() {
  const palette = useRuntimeThemeColors();
  return (
    <Text testID="palette">
      {JSON.stringify({
        palette,
        legacy: Colors[mockColorScheme],
        variables: themeVariables(palette),
      })}
    </Text>
  );
}

beforeEach(() => {
  mockColorScheme = 'light';
  useSettingsStore.setState({
    ...preferences(),
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
});

test('text keeps proportional leading when font and line height preferences change', async () => {
  const host = await render(
    <>
      <ThemedText testID="body">{'第一行\n第二行'}</ThemedText>
      <ThemedText
        testID="custom"
        style={[
          { fontSize: 13, lineHeight: 20 },
          { fontSize: 18, lineHeight: 28 },
        ]}
      >
        自定义排版
      </ThemedText>
    </>,
  );
  const { fontSize: initialFontSize, lineHeight: initialLineHeight } =
    host.getByTestId('body').props.style as {
      fontSize: number;
      lineHeight: number;
    };
  expect(initialFontSize).toBeGreaterThan(0);
  expect(initialLineHeight).toBeGreaterThanOrEqual(initialFontSize);
  expect(host.getByTestId('custom')).toHaveStyle({
    fontSize: 18,
    lineHeight: 28,
  });

  await act(() => useSettingsStore.setState({ fontSizeScale: 1.5 }));
  expect(host.getByTestId('body')).toHaveStyle({
    fontSize: initialFontSize * 1.5,
    lineHeight: initialLineHeight * 1.5,
  });
  expect(host.getByTestId('custom')).toHaveStyle({
    fontSize: 27,
    lineHeight: 42,
  });

  await act(() =>
    useSettingsStore.setState({ fontSizeScale: 0.8, lineHeightScale: 2 }),
  );
  expect(host.getByTestId('body')).toHaveStyle({
    fontSize: initialFontSize * 0.8,
    lineHeight: (initialLineHeight * 0.8 * 2) / 1.5,
  });
  expect(host.getByTestId('custom').props.style.lineHeight).toBeCloseTo(
    (28 * 0.8 * 2) / 1.5,
  );
});

describe.each(['light', 'dark'] as const)('%s runtime palette', (scheme) => {
  test.each(presets)(
    '%s keeps text and filled controls readable across all preferences',
    (readingBackground) => {
      for (const textContrast of ['standard', 'high'] as const) {
        for (const surfaceStyle of ['layered', 'flat'] as const) {
          for (const primaryColor of seeds) {
            const palette = resolveThemeColors(scheme, {
              primaryColor,
              readingBackground,
              textContrast,
              surfaceStyle,
            });
            expect(palette.primary).toMatch(/^#[\da-f]{6}$/i);
            if (primaryColor !== 'invalid')
              expect(palette.primary).toBe(
                primaryColor ?? colors.light.primary,
              );
            for (const background of neutralSurfaces) {
              expect(palette[background]).toMatch(/^#[\da-f]{6}$/i);
              for (const foreground of textRoles) {
                expect(
                  contrastRatio(palette[foreground], palette[background]),
                ).toBeGreaterThanOrEqual(
                  textContrast === 'high' && foreground === 'text' ? 7 : 4.5,
                );
              }
            }
            for (const [foreground, background] of filledPairs) {
              expect(palette[foreground]).toMatch(/^#[\da-f]{6}$/i);
              expect(
                contrastRatio(palette[foreground], palette[background]),
              ).toBeGreaterThanOrEqual(foreground === 'onPrimary' ? 3 : 4.5);
            }
          }
        }
      }
    },
  );

  test('preference updates keep hooks, legacy colors and every NativeWind variable synchronized', async () => {
    mockColorScheme = scheme;
    const host = await render(<PaletteProbe />);
    for (const next of [
      preferences({
        primaryColor: '#ffff00',
        readingBackground: 'warm',
        surfaceStyle: 'flat',
      }),
      preferences({
        primaryColor: '#331177',
        readingBackground: 'dim',
        textContrast: 'high',
      }),
      preferences(),
    ]) {
      await act(() => useSettingsStore.setState(next));
      const data: {
        palette: RuntimeThemeColors;
        legacy: RuntimeThemeColors;
        variables: Record<string, string>;
      } = JSON.parse(host.getByTestId('palette').props.children);
      expect(data.palette).toEqual(resolveThemeColors(scheme, next));
      expect(data.palette).toEqual(data.legacy);
      for (const [token, value] of Object.entries(data.palette)) {
        expect(data.variables[`--theme-${token}`]).toBe(
          /^#[\da-f]{6}$/i.test(value) ? rgbChannels(value).join(' ') : value,
        );
      }
      if (next.primaryColor === '#ffff00') {
        expect(data.palette.onPrimary).toBe('#000000');
        expect(data.variables['--theme-primary']).toBe('255 255 0');
      }
      if (next.primaryColor === null) {
        expect(data.palette.onPrimary).toBe('#ffffff');
        expect(data.variables['--theme-onPrimary']).toBe('255 255 255');
      }
    }
    await host.unmount();
  });
});

test('switching color scheme keeps the same selected seed and updates hook, legacy and variable palettes together', async () => {
  useSettingsStore.setState(
    preferences({ primaryColor: '#7e22ce', readingBackground: 'soft' }),
  );
  const host = await render(<PaletteProbe />);
  const light = JSON.parse(host.getByTestId('palette').props.children);
  mockColorScheme = 'dark';
  await host.rerender(<PaletteProbe />);
  const dark = JSON.parse(host.getByTestId('palette').props.children);
  expect(dark.palette.primary).toBe(light.palette.primary);
  expect(dark.palette.background).not.toBe(light.palette.background);
  expect(dark.palette).toEqual(dark.legacy);
  expect(dark.variables).toEqual(themeVariables(dark.palette));
  mockColorScheme = 'light';
  await host.rerender(<PaletteProbe />);
  expect(JSON.parse(host.getByTestId('palette').props.children)).toEqual(light);
  await host.unmount();
});
