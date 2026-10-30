import type { Href } from 'expo-router';

export interface PaneDetailDestination {
  name: string;
  params: Record<string, unknown>;
}

const staticDetails = new Set([
  '/guest/detail',
  '/settings/appearance',
  '/settings/features',
  '/settings/filter',
  '/settings/app-icon',
  '/settings/diagnostics',
]);

/** Only known absolute root details can bypass Expo's general URL resolver. */
export function resolvePaneDetailHref(
  href: Href,
): PaneDetailDestination | null {
  const pathname = typeof href === 'string' ? href : href.pathname;
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null;
  // Let Expo handle fragments, malformed escapes and unusual path syntax.
  if (pathname.includes('#') || pathname.includes('\\')) return null;
  const queryIndex = pathname.indexOf('?');
  const path = (
    queryIndex < 0 ? pathname : pathname.slice(0, queryIndex)
  ).replace(/\/$/, '');
  let params: Record<string, unknown> = {};
  if (queryIndex >= 0) {
    const query = new URLSearchParams(pathname.slice(queryIndex + 1));
    params = Object.fromEntries(
      [...new Set(query.keys())].map((key) => {
        const values = query.getAll(key);
        return [key, values.length === 1 ? values[0] : values];
      }),
    );
  }
  if (typeof href !== 'string') params = { ...params, ...href.params };
  if (staticDetails.has(path)) return { name: path.slice(1), params };
  const match =
    /^\/(answer|article|pin|comments|comments\/replies)\/([^/]+)$/.exec(path);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (id === '[id]') {
    const supplied = params.id;
    if (typeof supplied !== 'string' && typeof supplied !== 'number')
      return null;
    id = String(supplied);
  } else if (id.includes('[') || id.includes(']')) {
    return null;
  }
  if (!id || id === '.' || id === '..' || id.includes('/')) return null;
  return { name: `${match[1]}/[id]`, params: { ...params, id } };
}
