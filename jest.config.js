/** @type {import('jest').Config} */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  // Material Color Utilities publishes ESM; keep Expo's other exclusions intact.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace(
      '/node_modules/(?!',
      '/node_modules/(?!@material/material-color-utilities/|',
    ),
  ),
  watchman: false,
  // PNG/DEFLATE hot loops should not pay a VM-global lookup for each Math call.
  sandboxInjectedGlobals: ['Math'],
  transform: {
    '^.+\\.mjs$': [
      'babel-jest',
      { configFile: require.resolve('./babel.config.js') },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/features/rich-content/tests/**/*.test.ts',
    '<rootDir>/features/rich-content/tests/**/*.test.tsx',
  ],
};
