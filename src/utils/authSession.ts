import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { createNativeSessionSynchronizer } from './nativeSessionSync';

export const LEGACY_COOKIE_STORAGE_KEY = 'user_cookies';
const SECURE_STORE_SAFE_COOKIE_LENGTH = 2000;
const synchronize = createNativeSessionSynchronizer({
  isCurrent: (version) => getAuthSessionVersion() === version,
  getCookies: () => useAuthStore.getState().cookies,
  clear: () => CookieManager.clearAllStores(),
  setCookie: (name, value) =>
    CookieManager.set(
      'https://www.zhihu.com',
      { name, value, domain: '.zhihu.com', path: '/', secure: true },
      true,
    ),
  saveLegacy: (cookies) =>
    cookies && cookies.length < SECURE_STORE_SAFE_COOKIE_LENGTH
      ? SecureStore.setItemAsync(LEGACY_COOKIE_STORAGE_KEY, cookies)
      : SecureStore.deleteItemAsync(LEGACY_COOKIE_STORAGE_KEY),
});

/** Zustand is authoritative; obsolete native writes stop at each async boundary. */
export function syncNativeSessionCookies(
  _cookies: string | null,
): Promise<void> {
  // The caller's snapshot may rotate while it awaits account persistence.
  // Always mirror the selected session, including its latest response cookies.
  return synchronize(getAuthSessionVersion());
}
