const tokens = require('./src/constants/designTokens.json');
const { typography, radii, opacity } = tokens;
const runtimeColor = (token) => `rgb(var(--theme-${token}) / <alpha-value>)`;
const runtimePair = (token) => ({
  DEFAULT: runtimeColor(token),
  dark: runtimeColor(token),
});

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
    './src/features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: runtimeColor('primary'),
        'on-primary': runtimeColor('onPrimary'),
        link: runtimeColor('link'),
        danger: runtimeColor('danger'),
        'on-danger': runtimeColor('onDanger'),
        success: runtimeColor('success'),
        'on-success': runtimeColor('onSuccess'),
        warning: runtimePair('warning'),
        'on-warning': runtimeColor('onWarning'),
        foreground: runtimePair('text'),
        secondary: runtimePair('textSecondary'),
        tertiary: runtimePair('textTertiary'),
        inverse: runtimePair('textInverse'),
        muted: runtimePair('iconMuted'),
        base: runtimePair('background'),
        surface: runtimePair('backgroundSecondary'),
        'surface-tertiary': runtimePair('backgroundTertiary'),
        border: runtimePair('border'),
        divider: {
          DEFAULT: 'var(--theme-divider)',
          dark: 'var(--theme-divider)',
        },
        highlight: {
          DEFAULT: 'var(--theme-highlight)',
          dark: 'var(--theme-highlight)',
        },
        'tab-icon': runtimePair('tabIconDefault'),
        'tab-icon-active': runtimePair('tabIconSelected'),
      },
      fontFamily: {
        sans: [typography.fontFamily.sans],
        mono: [typography.fontFamily.mono],
      },
      fontSize: Object.fromEntries(
        Object.entries(typography.fontSize).map(([name, size]) => [
          name,
          `${size}px`,
        ]),
      ),
      lineHeight: Object.fromEntries(
        Object.entries(typography.lineHeight).map(([name, scale]) => [
          name,
          scale,
        ]),
      ),
      borderRadius: {
        sm: `${radii.sm}px`,
        md: `${radii.md}px`,
        lg: `${radii.lg}px`,
        pill: `${radii.pill}px`,
      },
      opacity: {
        disabled: opacity.disabled,
        pressed: opacity.pressed,
        subtle: opacity.subtle,
      },
    },
  },
  plugins: [],
};
