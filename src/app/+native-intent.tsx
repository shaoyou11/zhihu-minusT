import {
  isExpoInternalUrl,
  parseRichContentDevelopmentUrl,
  parseZhihuUrl,
} from '@/utils/url';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (isExpoInternalUrl(path)) return path;
  if (__DEV__) {
    const developmentPath = parseRichContentDevelopmentUrl(path);
    if (developmentPath) return developmentPath;
  }

  return parseZhihuUrl(path);
}
