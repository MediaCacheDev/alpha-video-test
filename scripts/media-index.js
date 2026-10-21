#!/usr/bin/env node
// Lists the files in assets/media/ in src/media.generated.json, which the app reads to grey out
// the clips that aren't there. Metro and webpack run it when they start; postinstall, fetch-media
// and make-media too. The file is only rewritten when the list changes, so watchers don't loop.
//
//   node scripts/media-index.js

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mediaDir = path.join(root, 'assets', 'media');
const indexFile = path.join(root, 'src', 'media.generated.json');

function writeMediaIndex() {
  const files = fs.existsSync(mediaDir)
    ? fs.readdirSync(mediaDir).filter((name) => !name.startsWith('.') && !name.endsWith('.part')).sort()
    : [];
  const contents = `${JSON.stringify({ files }, null, 2)}\n`;
  if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== contents) {
    fs.writeFileSync(indexFile, contents);
  }
  return files;
}

module.exports = { writeMediaIndex };

if (require.main === module) writeMediaIndex();
