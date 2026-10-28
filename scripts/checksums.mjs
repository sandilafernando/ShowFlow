#!/usr/bin/env node
/**
 * Writes SHA-256 checksums for the Windows release executables.
 *
 * Usage:
 *   npm run checksums            # write release/SHA256SUMS.txt
 *   npm run checksums -- --verify  # re-check existing checksums
 *
 * The file intentionally covers only the end-user executables in the release
 * root. The unpacked application directory and blockmaps are build by-products.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RELEASE_DIR = path.join(ROOT, 'release');
const CHECKSUM_FILE = path.join(RELEASE_DIR, 'SHA256SUMS.txt');
const VERIFY = process.argv.includes('--verify');
const EXECUTABLE_PATTERN = /^ShowFlow-.*-Windows-(Setup|Portable)\.exe$/i;

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function releaseExecutables() {
  let entries;
  try {
    entries = await fsp.readdir(RELEASE_DIR, { withFileTypes: true });
  } catch {
    throw new Error(`Release directory not found: ${RELEASE_DIR}. Run "npm run dist" first.`);
  }
  return entries
    .filter((entry) => entry.isFile() && EXECUTABLE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function writeChecksums() {
  const names = await releaseExecutables();
  if (!names.length) {
    throw new Error(
      'No Windows release executables found. Expected ShowFlow-<version>-Windows-Setup.exe or ShowFlow-<version>-Windows-Portable.exe in release/.',
    );
  }
  const lines = [];
  for (const name of names) {
    const digest = await sha256(path.join(RELEASE_DIR, name));
    lines.push(`${digest}  ${name}`);
    console.log(`SHA-256  ${name}  ${digest}`);
  }
  await fsp.writeFile(CHECKSUM_FILE, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, CHECKSUM_FILE)} (${lines.length} file${lines.length === 1 ? '' : 's'}).`);
}

async function verifyChecksums() {
  let raw;
  try {
    raw = await fsp.readFile(CHECKSUM_FILE, 'utf8');
  } catch {
    throw new Error(`Checksum file not found: ${path.relative(ROOT, CHECKSUM_FILE)}. Run "npm run checksums" first.`);
  }
  const entries = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([a-f0-9]{64})\s{2}(.+)$/i.exec(line);
      if (!match) throw new Error(`Malformed checksum line: ${line}`);
      return { expected: match[1].toLowerCase(), name: match[2] };
    });
  if (!entries.length) throw new Error('The checksum file is empty.');

  const seen = new Set();
  for (const entry of entries) {
    if (!EXECUTABLE_PATTERN.test(entry.name)) throw new Error(`Unexpected file in checksum list: ${entry.name}`);
    if (seen.has(entry.name)) throw new Error(`Duplicate checksum entry: ${entry.name}`);
    seen.add(entry.name);
    let actual;
    try {
      actual = await sha256(path.join(RELEASE_DIR, entry.name));
    } catch {
      throw new Error(`Checksum target is missing: ${entry.name}`);
    }
    if (actual !== entry.expected) {
      throw new Error(`Checksum mismatch for ${entry.name}.`);
    }
    console.log(`OK  ${entry.name}`);
  }

  // Catch newly built executables that were never added to the checksum file.
  const present = await releaseExecutables();
  const missing = present.filter((name) => !seen.has(name));
  if (missing.length) {
    throw new Error(`Release executable(s) not covered by the checksum file: ${missing.join(', ')}`);
  }
  console.log(`\nVerified ${entries.length} release executable${entries.length === 1 ? '' : 's'}.`);
}

try {
  if (VERIFY) await verifyChecksums();
  else await writeChecksums();
} catch (error) {
  console.error(`\nChecksum error: ${error.message}`);
  process.exitCode = 1;
}
