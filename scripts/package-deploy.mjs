#!/usr/bin/env node
// Build a deployable release zip (cross-platform; matches `pnpm package:zip`).
// Output: dist/finfolio-release.zip — copy to the prod VM, then build/migrate/up.
import { createWriteStream, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yazl from 'yazl';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');
const outFile = join(outDir, 'finfolio-release.zip');

// Top-level entries to include in the release.
const INCLUDE = [
  'apps',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'turbo.json',
  'docker-compose.prod.yml',
  'Dockerfile',
  '.env.prod.example',
];

// Directory/file names excluded anywhere in the tree.
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', '.docker', '.backups']);
const EXCLUDE_FILE = (name) => name === '.env' || name.startsWith('.env.') && name !== '.env.prod.example' && name !== '.env.example';

const zip = new yazl.ZipFile();

function addPath(abs) {
  const rel = relative(root, abs).split(sep).join('/');
  const st = statSync(abs);
  if (st.isDirectory()) {
    const base = abs.split(sep).pop();
    if (EXCLUDE_DIRS.has(base)) return;
    for (const entry of readdirSync(abs)) addPath(join(abs, entry));
  } else {
    const base = abs.split(sep).pop();
    if (EXCLUDE_FILE(base)) return;
    zip.addFile(abs, rel);
  }
}

mkdirSync(outDir, { recursive: true });
for (const entry of INCLUDE) {
  const abs = join(root, entry);
  if (existsSync(abs)) addPath(abs);
}

zip.outputStream.pipe(createWriteStream(outFile)).on('close', () => {
  console.log(`Built ${relative(root, outFile)}`);
});
zip.end();
