/**
 * The pixel-test screen's deep link and layout. The app (src/pixeltest) draws from this and the
 * driver (testing/pixels/run.ts) reads screenshots with it, so both agree on where things are.
 * It has no imports, because Metro bundles it into the app too.
 */

export const PLAYERS = ['cpp', 'ffk-gpu', 'ffk-cpu', 'gpu'] as const;
export type Player = (typeof PLAYERS)[number];
export type Background = 'black' | 'white';

export interface PixelTestCase {
  player: Player;
  /** Absolute folder on the device holding the card_<w>x<h> folders. */
  root: string;
  /** For example `card_383x217`. */
  card: string;
  /** A file in the card folder, for example `yuva.webm`. */
  fixture: string;
  frame: number;
  bg: Background;
  /** The player's `mode` ('preload', 'stream', 'streamAndPreload'); the player's default when absent. */
  mode?: string;
  /** Play and loop from the start instead of showing `frame` paused. */
  play?: boolean;
}

const HOST = 'alphavideotest://pixeltest';

export function pixelTestUrl(c: PixelTestCase): string {
  const params: [string, string | number | undefined][] = [
    ['player', c.player], ['root', c.root], ['card', c.card], ['fixture', c.fixture],
    ['frame', c.frame], ['bg', c.bg], ['mode', c.mode], ['play', c.play ? 1 : undefined],
  ];
  const query = params
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${HOST}?${query}`;
}

/** The case in a pixel-test link, or null for any other URL. */
export function parsePixelTestUrl(url: string | null | undefined): PixelTestCase | null {
  if (!url?.startsWith(`${HOST}?`)) return null;
  const params = new Map(
    url.slice(HOST.length + 1).split('&').map((pair) => {
      const [k, v = ''] = pair.split('=');
      return [k, decodeURIComponent(v)] as const;
    }),
  );
  const player = params.get('player') as Player;
  const root = params.get('root'), card = params.get('card'), fixture = params.get('fixture');
  if (!PLAYERS.includes(player) || !root || !card || !fixture) return null;
  return {
    player,
    root,
    card,
    fixture,
    frame: Number(params.get('frame') ?? 0),
    bg: params.get('bg') === 'white' ? 'white' : 'black',
    mode: params.get('mode') || undefined,
    play: params.get('play') === '1',
  };
}

export function cardSize(card: string): { width: number; height: number } {
  const m = /^card_(\d+)x(\d+)$/.exec(card);
  if (!m) throw new Error(`Not a card folder name: ${card}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const framePng = (frame: number) => `frames/f_${String(frame).padStart(3, '0')}.png`;

/** In screen pixels. */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenLayout {
  /** A magenta square: the driver finds it to get the screenshot's origin and pixels per dp. */
  marker: PxRect;
  /** Plain background, to tell when a change of `bg` has been drawn. */
  background: PxRect;
  player: PxRect;
  /** The same frame's source PNG in a plain <Image>, which checks the capture itself. */
  control: PxRect;
}

export const MARKER_DP = { x: 8, y: 48, size: 16 };
const MARGIN_DP = 8;
const TOP_DP = 80;
const GAP_DP = 16;

/**
 * The card shows at its own pixel size, or scaled down to the screen width (1920x1080), with the
 * control below it. Everything is in whole screen pixels, so nothing is resampled at 1:1.
 */
export function screenLayout(card: { width: number; height: number }, screenWidthPx: number, pxPerDp: number): ScreenLayout {
  const px = (dp: number) => Math.round(dp * pxPerDp);
  const w = Math.min(card.width, screenWidthPx - 2 * px(MARGIN_DP));
  const h = Math.round((card.height * w) / card.width);
  const x = px(MARGIN_DP);
  const top = px(TOP_DP);
  return {
    marker: { x: px(MARKER_DP.x), y: px(MARKER_DP.y), w: px(MARKER_DP.size), h: px(MARKER_DP.size) },
    background: { x: px(MARKER_DP.x + MARKER_DP.size + 8), y: px(MARKER_DP.y), w: px(MARKER_DP.size), h: px(MARKER_DP.size) },
    player: { x, y: top, w, h },
    control: { x, y: top + h + px(GAP_DP), w, h },
  };
}
