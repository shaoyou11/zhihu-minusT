const MESSAGES = {
  'image-read': '无法读取图片文件，请重新选择',
  'image-metadata': '知乎图片上传信息无效，请稍后重试',
  'image-credentials': '图片上传凭证无效，请重新登录后重试',
  'image-expired': '图片上传凭证已过期，请重新上传',
  'image-signature': '图片上传校验失败，请重新上传',
  'image-time': '设备时间不准确，请开启自动时间后重试',
  'image-too-large': '图片过大，请选择较小的图片',
  'image-format': '图片格式或校验信息无效，请重新选择',
  'image-timeout': '图片上传超时，请检查网络后重试',
  'image-busy': '图片上传请求过多，请稍后重试',
  'image-server': '图片上传服务暂时不可用，请稍后重试',
  'image-pending': '知乎图片尚未处理完成',
  'image-failed': '图片上传失败，请稍后重试',
} as const;

export type SafeFeedbackCode = keyof typeof MESSAGES;

/** Only application-owned codes may produce precise local error feedback. */
export class SafeFeedbackError extends Error {
  constructor(public readonly code: SafeFeedbackCode) {
    super(MESSAGES[code]);
    this.name = 'SafeFeedbackError';
  }
}

export function getSafeFeedbackMessage(error: unknown): string | null {
  if (
    !(error instanceof SafeFeedbackError) ||
    !Object.hasOwn(MESSAGES, error.code)
  )
    return null;
  // Do not trust a mutable Error.message, even on an application error.
  return MESSAGES[error.code];
}

export const MAX_BUSINESS_MESSAGE_LENGTH = 120;
const TECHNICAL_TERMS = new Set([
  'api',
  'http',
  'https',
  'utf8',
  'mb',
  'kb',
  'gb',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'unicode',
  'ip',
  'dns',
  'tls',
  'ssl',
]);

/** Screen messages accept prose; transport diagnostics and echoed data do not. */
export function sanitizeBusinessFeedback(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const message = value.replace(/\s+/g, ' ').trim();
  const normalized = message.normalize('NFKC');
  if (
    !message ||
    !/\p{Script=Han}/u.test(normalized) ||
    !/^[\p{Script=Han}A-Za-z0-9 ，。！？、；：（）「」『』【】《》“”‘’(),!?:;-]+$/u.test(
      normalized,
    ) ||
    normalized.replace(/\D/g, '').length > 8 ||
    /cookie|authorization|bearer|token|secret|password|session|xsrf|x[ -]?zse|[zd][ _-]?c0/i.test(
      normalized,
    )
  )
    return null;
  const tokens = normalized.match(/[A-Za-z0-9_-]+/g) ?? [];
  if (
    tokens.some(
      (token) =>
        !/^\d{1,4}$/.test(token) && !TECHNICAL_TERMS.has(token.toLowerCase()),
    )
  )
    return null;
  if (/验证码|密码|令牌|密钥|认证字段/.test(normalized) && tokens.length > 0)
    return null;
  const characters = Array.from(message);
  return characters.length > MAX_BUSINESS_MESSAGE_LENGTH
    ? `${characters.slice(0, MAX_BUSINESS_MESSAGE_LENGTH - 1).join('')}…`
    : message;
}
