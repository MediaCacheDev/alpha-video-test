/**
 * The demo's stream-test link (alphavideotest://streamtest?c=<json>): it shows one AlphaVideoView
 * with these props and reports its events to the driver (testing/streaming/run.ts).
 */
const HOST = 'alphavideotest://streamtest';

export interface StreamTestCase {
  id: string;
  uri: string;
  /** The driver's event server: the screen requests `<report>/event?id=…&event=…&detail=…`. */
  report: string;
  storage?: 'auto' | 'disk' | 'memory' | 'none';
  mode?: 'stream' | 'preload' | 'streamAndPreload';
  decoder?: string;
  cacheKey?: string;
  headers?: Record<string, string>;
  dataSource?: string;
  /** Seconds to seek to once loaded. */
  seekTo?: number;
  /** Default true; false plays once and reports `end`. */
  loop?: boolean;
}

export function streamTestUrl(c: StreamTestCase): string {
  return `${HOST}?c=${encodeURIComponent(JSON.stringify(c))}`;
}

/** The case in a stream-test link, or null for any other URL. */
export function parseStreamTestUrl(url: string | null | undefined): StreamTestCase | null {
  if (!url?.startsWith(`${HOST}?c=`)) return null;
  try {
    const c = JSON.parse(decodeURIComponent(url.slice(HOST.length + 3))) as StreamTestCase;
    return c.id && c.uri && c.report ? c : null;
  } catch {
    return null;
  }
}
