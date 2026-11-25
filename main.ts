// Token Radar application runner.
// Orchestrates snapshot loading, scoring model evaluation, dataset serialization,
// static dashboard asset staging, validation checks, and dossier compilation.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

const TEXT_BYTE_LIMIT = 65_536;
const IMAGE_LIMITS = { max: 4, max_bytes: 524_288 };
const VALID_IMAGE_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function extractArgument(flag: string, fallback: string): string {
  const index = process.argv.indexOf(`--${flag}`);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1]!;
  }
  const prefix = `--${flag}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched === undefined ? fallback : matched.slice(prefix.length);
}

const inputParam = extractArgument('input', '/input');
const sourcePath = inputParam.endsWith('.json') ? inputParam : join(inputParam, 'snapshot.json');

if (!existsSync(sourcePath)) {
  process.stderr.write(`token radar error: snapshot file not found at ${sourcePath}. Please supply --input or mount /input.\n`);
  process.exit(2);
}

const outputDir = extractArgument('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const rawData = readFileSync(sourcePath, 'utf8');
const parsedSnapshot = parseSnapshot(rawData);
const { board, radar } = buildRadar(parsedSnapshot);

const validationError = boardIssue(board, parsedSnapshot);
if (validationError !== null) {
  process.stderr.write(`token radar error: evaluation board rejected by gate: ${validationError}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
const boardRowLines = board.map((r) => JSON.stringify(r)).join('\n');
writeFileSync(join(outputDir, 'board.json'), `{"rows":[${board.length > 0 ? '\n' + boardRowLines + '\n' : ''}]}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

function mirrorDirectoryFiles(src: string, dest: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dest, { recursive: true });
  const transferred: string[] = [];
  for (const filename of readdirSync(src)) {
    if (filename.startsWith('.')) continue;
    const currentPath = join(src, filename);
    if (!statSync(currentPath).isFile()) continue;
    copyFileSync(currentPath, join(dest, filename));
    transferred.push(filename);
  }
  return transferred;
}

mirrorDirectoryFiles(join(MODULE_DIR, 'dashboard'), join(outputDir, 'dashboard'));
const verifiedScreenshots = mirrorDirectoryFiles(join(MODULE_DIR, 'screenshots'), join(outputDir, 'screenshots'));

if (verifiedScreenshots.length < 3) {
  process.stderr.write(`token radar error: expected at least 3 screenshots, found ${verifiedScreenshots.length}.\n`);
  process.exit(1);
}

for (const imgName of verifiedScreenshots) {
  if (!VALID_IMAGE_PATTERN.test(imgName)) {
    process.stderr.write(`token radar error: invalid screenshot filename '${imgName}'. Must match standard naming pattern.\n`);
    process.exit(1);
  }
}

const dossierPayload = buildDossier(outputDir, {
  text_max_bytes: TEXT_BYTE_LIMIT,
  screenshots: IMAGE_LIMITS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});

writeFileSync(join(outputDir, 'dossier.json'), dossierPayload);

process.stdout.write(
  `token radar: processed ${parsedSnapshot.protocols.length} protocols, ${parsedSnapshot.watchlist.length} watchlist items, ${board.length} scored rows.\n` +
    `token radar: artifacts successfully generated in ${outputDir}.\n`,
);
