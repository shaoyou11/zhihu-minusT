export type RichContentVariant = 'default' | 'daily';

export const DAILY_AVATAR_SIZE = 40;

export function hasHtmlClass(
  className: string | undefined,
  expectedClass: string,
): boolean {
  return (className ?? '').split(/\s+/).includes(expectedClass);
}

export function isDailyAvatar(
  attributes: Record<string, string | undefined>,
  variant: RichContentVariant,
): boolean {
  return variant === 'daily' && hasHtmlClass(attributes.class, 'avatar');
}
