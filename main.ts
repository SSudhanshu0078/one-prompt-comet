// The entry program for make.fun's "The agent builds a game from one prompt" bounty (Node 22, standard library only).
// The entry is the post on X; this program hands the grader the post's address by copying POST.json
// from the repository root to the output directory. No network, no clock, no files outside the repository.
//
// Locally: mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate wants an X post's address, its id digits only: catch a placeholder here rather than at the gate.
const POST_URL = /^https:\/\/(www\.|mobile\.)?(x|twitter)\.com\/([A-Za-z0-9_]{1,15}\/status|i\/web\/status)\/\d+([?#].*)?$/;

function fail(why: string): never {
  console.error(`POST.json: ${why}`);
  process.exit(1);
}

let bytes: Buffer;
try {
  bytes = readFileSync(join(botDir, 'POST.json'));
} catch (err) {
  fail(`cannot be read from ${botDir} (${(err as Error).message})`);
}
if (bytes.length > 16384) fail('is over 16384 bytes');

let post: unknown;
try {
  post = JSON.parse(bytes.toString('utf8'));
} catch {
  fail('is not JSON');
}
const url = (post as { url?: unknown } | null)?.url;
if (typeof url !== 'string' || !POST_URL.test(url)) fail(`"url" must be https://x.com/<handle>/status/<id>, got ${JSON.stringify(url)}`);

// Copy the file as it is, byte for byte, so both grader runs write the same output.
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'POST.json'), bytes);
