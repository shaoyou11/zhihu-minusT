import axios from 'axios';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { type SafeFeedbackCode, SafeFeedbackError } from '@/utils/safeFeedback';
import apiClient from '../client';

export interface LocalImageAsset {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
  fileName?: string | null;
}

export interface ZhihuImage {
  imageId: string;
  imageKey?: string;
  src: string;
  originalSrc?: string;
  watermark?: string;
  watermarkSrc?: string;
}

export interface UploadedImage extends ZhihuImage {
  width: number;
  height: number;
}

interface UploadToken {
  access_key: string;
  access_token: string;
  access_timestamp: number;
  access_id: string;
}

interface UploadFile {
  image_id: string | number;
  state: number;
  publish_state?: number;
  object_key?: string;
}

interface ImageCreateResponse {
  upload_token?: UploadToken;
  upload_vendor?: string;
  upload_file?: UploadFile;
}

interface ImageDetailResponse {
  status?: string;
  src?: string;
  original_hash?: string;
  original_src?: string;
  watermark?: string;
  watermark_src?: string;
}

const IMAGE_API_URL = 'https://api.zhihu.com/images';
const IMAGE_UPLOAD_URL = 'https://zhihu-pics-upload.zhimg.com';
const OSS_BUCKET_NAME = 'zhihu-pics';
const OSS_USER_AGENT = 'aliyun-sdk-js/6.8.0 Expo 55 React Native';

function encodeUtf8(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return Uint8Array.from(bytes);
}

function concatenateBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function digestBytes(
  algorithm: CryptoDigestAlgorithm,
  bytes: Uint8Array,
): Promise<ArrayBuffer> {
  // Keep the runtime value as Uint8Array. Android's Expo module bridges
  // TypedArray correctly but cannot convert a standalone ArrayBuffer.
  return digest(algorithm, bytes as unknown as BufferSource);
}

function toBase64(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabet[(bits >> 18) & 63];
    result += alphabet[(bits >> 12) & 63];
    result += second === undefined ? '=' : alphabet[(bits >> 6) & 63];
    result += third === undefined ? '=' : alphabet[bits & 63];
  }
  return result;
}

async function hmacSha1Base64(
  secret: string,
  message: string,
): Promise<string> {
  const blockSize = 64;
  const secretBytes = encodeUtf8(secret);
  const normalizedSecret =
    secretBytes.length > blockSize
      ? new Uint8Array(
          await digestBytes(CryptoDigestAlgorithm.SHA1, secretBytes),
        )
      : secretBytes;
  const paddedSecret = new Uint8Array(blockSize);
  paddedSecret.set(normalizedSecret);

  const innerPad = new Uint8Array(blockSize);
  const outerPad = new Uint8Array(blockSize);
  for (let index = 0; index < blockSize; index += 1) {
    innerPad[index] = paddedSecret[index] ^ 0x36;
    outerPad[index] = paddedSecret[index] ^ 0x5c;
  }

  const innerHash = new Uint8Array(
    await digestBytes(
      CryptoDigestAlgorithm.SHA1,
      concatenateBytes(innerPad, encodeUtf8(message)),
    ),
  );
  const signature = new Uint8Array(
    await digestBytes(
      CryptoDigestAlgorithm.SHA1,
      concatenateBytes(outerPad, innerHash),
    ),
  );
  return toBase64(signature);
}

function canonicalizeOssHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
    .join('');
}

async function createOssAuthorization(
  token: UploadToken,
  objectKey: string,
  mimeType: string,
  ossDate: string,
  ossUserAgent: string,
): Promise<string> {
  const ossHeaders = {
    'x-oss-date': ossDate,
    'x-oss-security-token': token.access_token,
    'x-oss-user-agent': ossUserAgent,
  };
  const normalizedObjectKey = objectKey.startsWith('/')
    ? objectKey.slice(1)
    : objectKey;
  // The upload host omits the bucket from its URL, but OSS V1 still expects
  // the bucket name in CanonicalizedResource.
  const canonicalizedResource = `/${OSS_BUCKET_NAME}/${normalizedObjectKey}`;
  const stringToSign = [
    'PUT',
    '',
    mimeType,
    // OSS V1 uses x-oss-date as the Date line when no separate Date header is sent.
    ossDate,
    `${canonicalizeOssHeaders(ossHeaders)}${canonicalizedResource}`,
  ].join('\n');
  const signature = await hmacSha1Base64(token.access_key, stringToSign);
  return `OSS ${token.access_id}:${signature}`;
}

function getImageMimeType(asset: LocalImageAsset): string {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType?.startsWith('image/')) return mimeType;

  const extension = asset.fileName?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function getImageDimensions(asset: LocalImageAsset) {
  return {
    width: Math.max(1, Math.round(asset.width)),
    height: Math.max(1, Math.round(asset.height)),
  };
}

function getXmlValue(body: string, tag: string): string | undefined {
  const match = body.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`));
  return match?.[1];
}

const OSS_FEEDBACK: Readonly<Record<string, SafeFeedbackCode>> = {
  AccessDenied: 'image-credentials',
  InvalidAccessKeyId: 'image-credentials',
  InvalidSecurityToken: 'image-credentials',
  SecurityTokenExpired: 'image-expired',
  SignatureDoesNotMatch: 'image-signature',
  RequestTimeTooSkewed: 'image-time',
  EntityTooLarge: 'image-too-large',
  InvalidArgument: 'image-format',
  InvalidDigest: 'image-format',
  BadDigest: 'image-format',
  RequestTimeout: 'image-timeout',
  SlowDown: 'image-busy',
  InternalError: 'image-server',
  ServiceUnavailable: 'image-server',
};

function createOssUploadError(status: number, body: string): Error {
  const code = getXmlValue(body, 'Code')?.trim();
  if (code && Object.hasOwn(OSS_FEEDBACK, code))
    return new SafeFeedbackError(OSS_FEEDBACK[code]);
  // OSS diagnostics may echo the signed URL, credentials or request input.
  if (status === 401 || status === 403)
    return new SafeFeedbackError('image-credentials');
  if (status === 408) return new SafeFeedbackError('image-timeout');
  if (status === 413) return new SafeFeedbackError('image-too-large');
  if (status === 415) return new SafeFeedbackError('image-format');
  if (status === 429) return new SafeFeedbackError('image-busy');
  if (status >= 500) return new SafeFeedbackError('image-server');
  return new SafeFeedbackError('image-failed');
}

function normalizeImage(
  imageId: string | number,
  data: ImageDetailResponse,
): ZhihuImage {
  if (data.status !== 'success' || !data.src) {
    throw new SafeFeedbackError('image-pending');
  }

  return {
    imageId: String(imageId),
    imageKey: data.original_hash,
    src: data.src,
    originalSrc: data.original_src,
    watermark: data.watermark,
    watermarkSrc: data.watermark_src,
  };
}

/** Fetch the public image URLs for a Zhihu image id. */
export async function getImage(
  imageId: string | number,
  options?: { signal?: AbortSignal },
): Promise<ZhihuImage> {
  const response = await apiClient.get<ImageDetailResponse>(
    `${IMAGE_API_URL}/${encodeURIComponent(String(imageId))}`,
    { signal: options?.signal },
  );
  return normalizeImage(imageId, response.data);
}

async function getImageAfterUpload(
  imageId: string | number,
  signal?: AbortSignal,
): Promise<ZhihuImage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await getImage(imageId, { signal });
    } catch (error) {
      lastError = error;
      const isPendingProcessing =
        error instanceof SafeFeedbackError && error.code === 'image-pending';
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      const isTransientRequestError =
        axios.isAxiosError(error) &&
        !axios.isCancel(error) &&
        (status === undefined ||
          status === 408 ||
          status === 429 ||
          status >= 500);
      if (!isPendingProcessing && !isTransientRequestError) throw error;
      if (attempt === 7) break;
      await waitForProcessing(500 * (attempt + 1), signal);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new SafeFeedbackError('image-pending');
}

async function uploadToObjectStorage(
  asset: LocalImageAsset,
  token: UploadToken,
  objectKey: string,
  signal?: AbortSignal,
): Promise<void> {
  const mimeType = getImageMimeType(asset);
  const ossDate = new Date().toUTCString();
  const authorization = await createOssAuthorization(
    token,
    objectKey,
    mimeType,
    ossDate,
    OSS_USER_AGENT,
  );
  assertNotAborted(signal);
  const task = FileSystem.createUploadTask(
    `${IMAGE_UPLOAD_URL}/${objectKey}`,
    asset.uri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': mimeType,
        authorization,
        'x-oss-date': ossDate,
        'x-oss-security-token': token.access_token,
        'x-oss-user-agent': OSS_USER_AGENT,
      },
    },
  );
  const cancel = () => {
    void task.cancelAsync().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  let uploadResponse: Awaited<ReturnType<typeof task.uploadAsync>>;
  try {
    uploadResponse = await task.uploadAsync();
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
  assertNotAborted(signal);
  if (!uploadResponse) throw new axios.CanceledError('图片上传已取消');

  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw createOssUploadError(uploadResponse.status, uploadResponse.body);
  }
}

async function markImageUploadSuccessful(
  imageId: string | number,
  signal?: AbortSignal,
) {
  await apiClient.put(
    `${IMAGE_API_URL}/${encodeURIComponent(String(imageId))}/uploading_status`,
    { upload_result: 'success' },
    { signal },
  );
}

/**
 * Create or reuse a Zhihu image and return its resolved public URLs.
 * The source is passed through because the same image service is used by
 * multiple Zhihu publishing surfaces, not only comments.
 */
export async function uploadImage(
  asset: LocalImageAsset,
  source = 'comment',
  options?: { signal?: AbortSignal },
): Promise<UploadedImage> {
  const signal = options?.signal;
  assertNotAborted(signal);
  const fileInfo = await FileSystem.getInfoAsync(asset.uri, { md5: true });
  assertNotAborted(signal);
  if (!fileInfo.exists || !fileInfo.md5) {
    throw new SafeFeedbackError('image-read');
  }

  const response = await apiClient.post<ImageCreateResponse>(
    IMAGE_API_URL,
    {
      image_hash: fileInfo.md5,
      source,
    },
    { signal },
  );
  assertNotAborted(signal);
  const file = response.data.upload_file;
  if (file?.image_id === undefined || file.image_id === null) {
    throw new SafeFeedbackError('image-metadata');
  }

  const imageId = String(file.image_id);
  // state=1 means Zhihu already has this hash and intentionally omits the
  // short-lived upload token. Only state=2 requires an OSS upload.
  const needsUpload = file.state === 2;
  const objectKey = file.object_key ?? `v2-${fileInfo.md5.toLowerCase()}`;
  if (needsUpload) {
    const token = response.data.upload_token;
    if (!token?.access_id || !token.access_key || !token.access_token) {
      throw new SafeFeedbackError('image-credentials');
    }

    await uploadToObjectStorage(asset, token, objectKey, signal);
    assertNotAborted(signal);
    await markImageUploadSuccessful(imageId, signal);
  }

  const image = await getImageAfterUpload(imageId, signal);
  const dimensions = getImageDimensions(asset);
  return {
    ...image,
    imageKey: image.imageKey ?? objectKey,
    ...dimensions,
  };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new axios.CanceledError('图片上传已取消');
}

function waitForProcessing(
  duration: number,
  signal?: AbortSignal,
): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new axios.CanceledError('图片上传已取消'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, duration);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
