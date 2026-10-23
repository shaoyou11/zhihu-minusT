import type { RuntimeThemeColors } from '@/constants/theme';
import { rgbChannels } from './colorContrast';

export function themeVariables(
  palette: RuntimeThemeColors,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([name, value]) => [
      `--theme-${name}`,
      /^#[0-9a-f]{6}$/i.test(value) ? rgbChannels(value).join(' ') : value,
    ]),
  );
}
