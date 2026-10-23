import type { Analytics } from '@react-native-firebase/analytics';

/** Keep optional native-module loading separate from telemetry policy. */
export async function loadFirebaseAnalytics(): Promise<Analytics | null> {
  try {
    const { getAnalytics } = await import('@react-native-firebase/analytics');
    return getAnalytics();
  } catch {
    return null;
  }
}
