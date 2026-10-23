#!/usr/bin/env node
// Downloads the demo media listed in media.manifest.json into assets/media/, from the GitHub
// Release named there. Files already present with the right SHA-256 are left alone. These are the
// sources: `npm run make-media` makes the other variants from them.
//
//   npm run fetch-media [-- --size s|m|l]
//
// --size downloads only that size's sources (see media-sizes.mjs) and deletes the others; without
// it, every source.

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import mediaIndex from './media-index.js';
import { SIZES, parseSize } from './media-sizes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = path.join(root, 'assets', 'media');
const manifest = JSON.parse(await readFile(path.join(root, 'media.manifest.json'), 'utf8'));
const { values: args } = parseArgs({ options: { size: { type: 'string' } } });
const size = args.size == null ? null : parseSize(args.size);
if (args.size != null && !size) throw new Error(`--size is s, m or l, not "${args.size}"`);

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function isCurrent(file, entry) {
  try {
    const { size } = await stat(file);
    return size === entry.size && (await sha256(file)) === entry.sha256;
  } catch {
    return false;
  }
}

async function download(entry, file) {
  const url = `${manifest.release}/${entry.name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

  const partial = `${file}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const actual = await sha256(partial);
  if (actual !== entry.sha256) {
    await rm(partial);
    throw new Error(`${entry.name}: SHA-256 is ${actual}, expected ${entry.sha256}`);
  }
  await rename(partial, file);
}

await mkdir(mediaDir, { recursive: true });
let fetched = 0;
for (const entry of manifest.files) {
  const file = path.join(mediaDir, entry.name);
  if (size && !SIZES[size].download(entry.name)) {
    // Removed, not just left alone: whatever is in assets/media goes into the app
    if (await rm(file).then(() => true, () => false)) console.log(`  – ${entry.name} removed (not in ${size})`);
    continue;
  }
  fetched++;
  if (await isCurrent(file, entry)) {
    console.log(`  ✔ ${entry.name}`);
    continue;
  }
  console.log(`  ↓ ${entry.name} (${(entry.size / 1e6).toFixed(1)} MB)`);
  await download(entry, file);
}
mediaIndex.writeMediaIndex();
console.log(`✅ ${fetched} sources in ${path.relative(root, mediaDir)}${size ? '' : '. Next: npm run make-media'}`);
