/** Legacy access resolves the same runtime palette as Themed and NativeWind.
 * New components should subscribe with useRuntimeThemeColors().
 */

import { useSettingsStore } from '@/store/useSettingsStore';
import {
  type RuntimeThemeColors,
  resolveThemeColors,
  type ThemePreferences,
} from './theme';

const cache: Partial<
  Record<
    'light' | 'dark',
    { preferences: ThemePreferences; palette: RuntimeThemeColors }
  >
> = {};
function runtimePalette(scheme: 'light' | 'dark'): RuntimeThemeColors {
  const state = useSettingsStore.getState();
  const previous = cache[scheme];
  if (
    previous &&
    previous.preferences.primaryColor === state.primaryColor &&
    previous.preferences.readingBackground === state.readingBackground &&
    previous.preferences.textContrast === state.textContrast &&
    previous.preferences.surfaceStyle === state.surfaceStyle
  )
    return previous.palette;
  const preferences: ThemePreferences = {
    primaryColor: state.primaryColor,
    readingBackground: state.readingBackground,
    textContrast: state.textContrast,
    surfaceStyle: state.surfaceStyle,
  };
  const palette = resolveThemeColors(scheme, preferences);
  cache[scheme] = { preferences, palette };
  return palette;
}
const Colors = {
  get light() {
    return runtimePalette('light');
  },
  get dark() {
    return runtimePalette('dark');
  },
};
export default Colors;
