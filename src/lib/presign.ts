// Builds a proxy URL for a given R2 key without any network validation.
// Use when the caller does its own existence check (e.g. findLatestSnapshotDate).
export function buildUrl(key: string): string {
  return `${window.location.origin}/api/data?key=${encodeURIComponent(key)}`;
}

// Session-level cache: URL → exists (true) or 404 (false).
// In-flight map deduplicates concurrent HEAD checks for the same URL.
const _existsCache = new Map<string, boolean>();
const _inFlight = new Map<string, Promise<boolean>>();

async function urlExists(url: string): Promise<boolean> {
  const cached = _existsCache.get(url);
  if (cached !== undefined) return cached;

  // Return existing in-flight promise so concurrent callers don't double-request
  const existing = _inFlight.get(url);
  if (existing) return existing;

  const promise = fetch(url, { method: "HEAD" })
    .then((resp) => { _existsCache.set(url, resp.ok); return resp.ok; })
    .catch(() => { _existsCache.set(url, false); return false; })
    .finally(() => _inFlight.delete(url));

  _inFlight.set(url, promise);
  return promise;
}

// Resolves keys to same-origin proxy URLs, then filters out partitions that
// don't exist on R2 (e.g. years before a stock was listed, or future months).
// Results are cached so repeated calls for the same key are instant.
export async function presignKeys(keys: string[]): Promise<string[]> {
  const base = window.location.origin;
  const urls = keys.map((key) => `${base}/api/data?key=${encodeURIComponent(key)}`);
  const checks = await Promise.all(urls.map(urlExists));
  return urls.filter((_, i) => checks[i]);
}
