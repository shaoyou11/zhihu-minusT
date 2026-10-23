import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_NAME = 'zhihu_auth_aes_key_v1';
const KEY_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const additionalData = () => new TextEncoder().encode('zhihu-auth-file:v1');
let keyPromise: Promise<AESEncryptionKey> | null = null;

async function getKey(create: boolean): Promise<AESEncryptionKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
      if (existing) return AESEncryptionKey.import(existing, 'base64');
      if (!create) throw new Error('登录密钥暂时不可用');
      const key = await AESEncryptionKey.generate();
      const encoded = await key.encoded('base64');
      await SecureStore.setItemAsync(KEY_NAME, encoded, KEY_OPTIONS);
      if ((await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS)) !== encoded)
        throw new Error('登录密钥保存失败');
      return key;
    })();
  }
  try {
    return await keyPromise;
  } catch {
    keyPromise = null;
    throw new Error('登录密钥暂时不可用');
  }
}

export async function encryptAuthState(value: string): Promise<string> {
  const sealed = await aesEncryptAsync(
    new TextEncoder().encode(value),
    await getKey(true),
    { additionalData: additionalData() },
  );
  return sealed.combined('base64');
}

/** Android's combined-data bridge requires bytes rather than base64 text. */
export function createAuthSealedDataFromBase64(value: string): AESSealedData {
  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
    return AESSealedData.fromCombined(bytes);
  } catch {
    throw new Error('账号密文格式无效');
  }
}

export async function decryptAuthState(value: string): Promise<string> {
  const bytes = await aesDecryptAsync(
    createAuthSealedDataFromBase64(value),
    await getKey(false),
    { additionalData: additionalData() },
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Only called after the user explicitly chooses to erase local accounts. */
export async function resetAuthEncryptionKey(): Promise<void> {
  keyPromise = null;
  await SecureStore.deleteItemAsync(KEY_NAME, KEY_OPTIONS);
}
