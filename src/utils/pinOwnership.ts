import type { LocalAccountIdentitySource } from './localAccount';

export function isPinOwner(
  author: LocalAccountIdentitySource | null | undefined,
  me: LocalAccountIdentitySource | null | undefined,
  authenticated: boolean,
): boolean {
  if (!authenticated || !author || !me) return false;
  if (author.id && me.id) return String(author.id) === String(me.id);
  return Boolean(
    author.url_token && me.url_token && author.url_token === me.url_token,
  );
}
