/** @type {import('jest').Config} */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  testTimeout: 10_000,
  // These dependencies publish ESM; keep Expo's other exclusions intact.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace(
      '/node_modules/(?!',
      '/node_modules/(?!@sentry/|@material/material-color-utilities/|htmlparser2/|domhandler/|domutils/|dom-serializer/|domelementtype/|entities/|',
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
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/src/features/rich-content/tests/**/*.test.ts',
    '<rootDir>/src/features/rich-content/tests/**/*.test.tsx',
  ],
};
