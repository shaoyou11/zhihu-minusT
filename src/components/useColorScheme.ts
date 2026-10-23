import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useThemeStore } from '@/store/useThemeStore';

export const useColorScheme = () => {
  // Legacy Colors readers subscribe here so preference changes also rerender.
  useSettingsStore(
    useShallow((state) => [
      state.primaryColor,
      state.readingBackground,
      state.textContrast,
      state.surfaceStyle,
    ]),
  );
  const isDark = useThemeStore((state) => state.isDark);
  return isDark ? 'dark' : 'light';
};
