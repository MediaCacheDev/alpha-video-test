#!/usr/bin/env node
// Downloads the demo media listed in media.manifest.json into assets/media/, from the GitHub
// Release named there. Files already present with the right SHA-256 are left alone.
//
//   npm run fetch-media

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = path.join(root, 'assets', 'media');
const manifest = JSON.parse(await readFile(path.join(root, 'media.manifest.json'), 'utf8'));

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
for (const entry of manifest.files) {
  const file = path.join(mediaDir, entry.name);
  if (await isCurrent(file, entry)) {
    console.log(`  ✔ ${entry.name}`);
    continue;
  }
  console.log(`  ↓ ${entry.name} (${(entry.size / 1e6).toFixed(1)} MB)`);
  await download(entry, file);
}
console.log(`✅ ${manifest.files.length} files in ${path.relative(root, mediaDir)}`);
