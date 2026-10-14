/**
 * The pixel run as one HTML page: a row per case, a cell per frame, and the captures of the
 * first frame and of every frame that failed.
 */
import fs from 'node:fs';
import type { CaseResult, FrameResult } from './run.ts';

const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function cell(r: FrameResult): string {
  const problems = [r.error, ...r.failures, ...r.controlFailures.map((f) => `control: ${f}`)].filter(Boolean) as string[];
  const cls = r.error ? 'err' : r.failures.length ? 'fail' : r.controlFailures.length ? 'warn' : 'ok';
  const numbers = r.seenCodes
    ? `frame codes: ${r.seenCodes.join(' ')}`
    : r.player
      ? `colours ${r.player.colours.toFixed(1)}, alpha ramp ${r.player.alphaRamp.toFixed(1)}, corners ${r.player.corners.toFixed(1)}, ` +
        `edge ${r.player.edgePositionPx.toFixed(2)} px, seek ${r.waitMs} ms`
      : '';
  const title = r.frame < 0 ? 'playback' : r.frame;
  return `<td class="${cls}" title="${escape(numbers)}">${title}${problems.map((p) => `<div class="why">${escape(p)}</div>`).join('')}</td>`;
}

export function writeHtmlReport(file: string, platform: string, results: CaseResult[]): void {
  const rows = results.map((c) => {
    const images = c.frames.flatMap((f) => f.images.map((src) => `<a href="${src}"><img src="${src}" title="frame ${f.frame}"></a>`));
    const cls = { pass: 'ok', known: 'warn', fail: 'fail', 'unexpected pass': 'fail' }[c.status];
    const known = c.knownIssue ? `<div class="why">${c.status}: ${escape(c.knownIssue)}</div>` : '';
    return `<tr><th class="${cls}">${escape(`${c.card}/${c.fixture}`)}<br>${c.player} ${c.mode ?? ''}${known}</th>` +
      `${c.frames.map(cell).join('')}<td class="imgs">${images.join('')}</td></tr>`;
  });
  const passed = results.filter((c) => c.status === 'pass').length;
  const known = results.filter((c) => c.status === 'known').length;
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Pixel tests: ${platform}</title>
<style>
body { font: 13px system-ui; margin: 16px; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; text-align: left; }
.ok { background: #e6f4e6; } .fail, .err { background: #fbe3e3; } .warn { background: #fff4d6; }
.why { font-size: 11px; color: #a00; max-width: 220px; }
.imgs img { height: 72px; margin-right: 4px; background: repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 16px 16px; }
</style>
<h1>Pixel tests on ${platform}: ${passed}/${results.length} cases pass, ${known} known issues</h1>
<p>Hover a frame for its numbers. Errors are 0-255 levels against the test card; "control" rows check the capture itself.</p>
<table>${rows.join('\n')}</table>
`);
}
