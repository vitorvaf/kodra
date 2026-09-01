#!/usr/bin/env node
// kanbots npx — optional integrity verification helper.
//
// Today the release pipeline does not publish a SHA256 manifest, so this is a
// no-op stub. When release.yml starts emitting a sidecar manifest (e.g.
// kanbots-<version>-checksums.txt with `<sha256>  <filename>` lines), wire
// this into postinstall.js right after the download finishes.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyAgainst(filePath, expectedHex) {
  const actual = sha256(filePath);
  if (actual.toLowerCase() !== String(expectedHex).toLowerCase()) {
    throw new Error(`checksum mismatch for ${filePath}: expected ${expectedHex}, got ${actual}`);
  }
}

module.exports = { sha256, verifyAgainst };

if (require.main === module) {
  const [, , filePath, expected] = process.argv;
  if (!filePath) {
    process.stderr.write('usage: node scripts/verify.js <file> [expected-sha256]\n');
    process.exit(2);
  }
  if (expected) {
    try {
      verifyAgainst(filePath, expected);
      process.stdout.write('ok\n');
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(`${sha256(filePath)}  ${filePath}\n`);
  }
}
