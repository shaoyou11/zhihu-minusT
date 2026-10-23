function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

/** Callers supply a native player route and an already validated image URL. */
export function videoPlaybackHtml({
  route,
  posterUrl,
  title,
}: {
  route?: string;
  posterUrl?: string;
  title?: string;
}): string {
  const tag = route ? 'a' : 'div';
  const href = route ? ` href="${escapeHtml(route)}"` : '';
  const className = `zhihu-video${posterUrl ? ' zhihu-video-with-cover' : ''}`;
  const image = posterUrl
    ? `<img class="zhihu-video-cover" src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title || '视频封面')}">`
    : '';
  const label = route ? '▶ 播放视频' : '视频不可用';
  return `<${tag} class="${className}"${href}>${image}<span class="zhihu-video-play">${label}</span></${tag}>`;
}
