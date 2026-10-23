const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname, {
  // Telemetry only captures errors; replay and the web feedback widget are unused.
  // Exclude their browser packages without changing Hermes or error source maps.
  includeWebReplay: false,
  includeWebFeedback: false,
});

module.exports = withNativeWind(config, {
  input: './src/global.css',
  typescriptEnvPath: 'src/nativewind-env.d.ts',
});
