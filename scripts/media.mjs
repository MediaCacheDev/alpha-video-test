#!/usr/bin/env node
// Gets the demo media at one of three sizes: fetch-media, then make-media. Asks which size when
// it isn't given.
//
//   npm run media [-- s|m|l]

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SIZE_HELP, parseSize } from './media-sizes.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const given = process.argv.slice(2).filter((arg) => arg !== '--size')[0];

async function askSize() {
  if (!process.stdin.isTTY) {
    console.error(`Which size? npm run media -- s|m|l\n${SIZE_HELP}`);
    process.exit(1);
  }
  console.log(`Which demo media?\n${SIZE_HELP}\nFiles the size leaves out are deleted from assets/media/, as everything there goes into the app.`);
  const lines = readline.createInterface({ input: process.stdin });
  try {
    process.stdout.write('Size [s/m/l]: ');
    for await (const line of lines) {
      const size = parseSize(line);
      if (size) return size;
      process.stdout.write('s, m or l: ');
    }
  } finally {
    lines.close();
  }
  process.exit(1);
}

let size = given == null ? null : parseSize(given);
if (given != null && !size) {
  console.error(`Unknown size "${given}": s (small), m (medium) or l (large)\n${SIZE_HELP}`);
  process.exit(1);
}
size ??= await askSize();
console.log(`\n${size} media`);
for (const script of ['fetch-media.mjs', 'make-media.mjs']) {
  try {
    execFileSync(process.execPath, [path.join(scripts, script), '--size', size], { stdio: 'inherit' });
  } catch (error) {
    // The script has printed its own error
    process.exit(error.status ?? 1);
  }
}
