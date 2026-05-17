const PROXY_HOSTS = ["media.api-sports.io", "media-2.api-sports.io", "media-3.api-sports.io", "media-4.api-sports.io"];

export function proxyLogoUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (PROXY_HOSTS.includes(parsed.hostname)) {
      return `/api/img-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // not a valid URL, return as-is
  }
  return url;
}
