import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { isSupportedMediaPath, mediaKindForPath } from '../../shared/media-types.js';

const MAX_IMPORT_FILES = 5000;
const MAX_SCAN_ENTRIES = 30000;
const MAX_DEPTH = 12;
const SKIP_NAMES = new Set(['node_modules', '.git', '.svn', '$recycle.bin', 'system volume information']);

function normalisePath(filePath) {
  return path.resolve(filePath);
}

async function walkDirectory(root, { recursive = true } = {}) {
  const files = [];
  let scanned = 0;
  let errors = 0;
  const queue = [{ directory: root, depth: 0 }];
  while (queue.length && files.length < MAX_IMPORT_FILES && scanned < MAX_SCAN_ENTRIES) {
    const { directory, depth } = queue.shift();
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      errors += 1;
      continue;
    }
    for (const entry of entries) {
      scanned += 1;
      if (scanned > MAX_SCAN_ENTRIES) break;
      if (entry.name.startsWith('.') || SKIP_NAMES.has(entry.name.toLowerCase())) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive && depth < MAX_DEPTH) queue.push({ directory: fullPath, depth: depth + 1 });
      } else if (entry.isFile() && isSupportedMediaPath(fullPath)) {
        files.push(fullPath);
        if (files.length >= MAX_IMPORT_FILES) break;
      }
    }
  }
  return { files, scanned, errors, truncated: files.length >= MAX_IMPORT_FILES || scanned >= MAX_SCAN_ENTRIES };
}

export async function buildMediaRecords(paths, { recursive = false } = {}) {
  const candidates = new Set();
  let errors = 0;
  for (const inputPath of paths) {
    let stats;
    try {
      stats = await fsp.stat(inputPath);
    } catch {
      errors += 1;
      continue;
    }
    if (stats.isDirectory()) {
      const result = await walkDirectory(inputPath, { recursive: recursive !== false });
      result.files.forEach((file) => candidates.add(normalisePath(file)));
      errors += result.errors;
    } else if (stats.isFile() && isSupportedMediaPath(inputPath)) {
      candidates.add(normalisePath(inputPath));
    }
  }

  const records = [];
  const seen = new Set();
  for (const filePath of candidates) {
    const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const stats = await fsp.stat(filePath);
      if (!stats.isFile()) continue;
      records.push({
        path: filePath,
        name: path.basename(filePath),
        kind: mediaKindForPath(filePath),
        sizeBytes: stats.size,
      });
    } catch {
      errors += 1;
    }
    if (records.length >= MAX_IMPORT_FILES) break;
  }
  records.sort((a, b) => a.name.localeCompare(b.name));
  return {
    records,
    errors,
    skippedUnsupported: 0,
    truncated: records.length >= MAX_IMPORT_FILES,
  };
}

export async function checkMediaAvailability(assets) {
  const results = [];
  for (const asset of assets) {
    let available = false;
    try {
      const stats = await fsp.stat(asset.path);
      available = stats.isFile();
    } catch {
      available = false;
    }
    results.push({ id: asset.id, available });
  }
  return results;
}

export async function findRelinkMatches(folder, missingAssets) {
  const walked = await walkDirectory(folder, { recursive: true });
  const byName = new Map();
  for (const filePath of walked.files) {
    const key = path.basename(filePath).toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(filePath);
  }
  const matches = [];
  const ambiguous = [];
  const unresolved = [];
  const usedPaths = new Set();
  for (const asset of missingAssets) {
    const key = path.basename(asset.path).toLowerCase();
    const candidates = (byName.get(key) || []).filter(
      (candidate) => !usedPaths.has(candidate.toLowerCase()),
    );
    if (candidates.length === 1) {
      const filePath = candidates[0];
      usedPaths.add(filePath.toLowerCase());
      let sizeBytes = 0;
      try {
        sizeBytes = (await fsp.stat(filePath)).size;
      } catch {
        sizeBytes = 0;
      }
      matches.push({ id: asset.id, newPath: filePath, sizeBytes });
    } else if (candidates.length > 1) {
      ambiguous.push({ id: asset.id, name: asset.name, candidates: candidates.slice(0, 5) });
    } else {
      unresolved.push({ id: asset.id, name: asset.name, path: asset.path });
    }
  }
  return {
    matches,
    ambiguous,
    unresolved,
    scanned: walked.scanned,
    truncated: walked.truncated,
  };
}

export async function statSingleFile(filePath) {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new Error('The selected path is not a file.');
  return { sizeBytes: stats.size };
}

export function isReadableFileSync(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export const mediaImportLimits = Object.freeze({
  maxFiles: MAX_IMPORT_FILES,
  maxScanEntries: MAX_SCAN_ENTRIES,
  maxDepth: MAX_DEPTH,
});
