// Records a page frame by frame in headless Chrome and pipes the frames into ffmpeg.
// The pages (game/index.html?capture and video/scenes.html) only move when __advance() is called,
// so every frame is exact, however long a frame takes to draw.
//
//   node video/capture.mjs seeds <seconds> <first> <last>          find autopilot runs that survive
//   node video/capture.mjs game <seed> <seconds> <out.mp4>         record the game in demo mode
//   node video/capture.mjs scenes <prompt.txt> <source> <seconds> <out.mp4>
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30, STEPS = 60 / FPS, PORT = 9333;

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'comet-capture-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('headless Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), waiters = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method === 'Page.loadEventFired') waiters.splice(0).forEach((f) => f());
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page error');
    return r.result.value;
  };
  const open = async (url) => { const loaded = new Promise((r) => waiters.push(r)); await send('Page.navigate', { url }); await loaded; };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  const close = () => { ws.close(); proc.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ } }, 500); };
  return { open, evaluate, close };
}

async function record(page, seconds, out) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(seconds * FPS);
  for (let f = 0; f < frames; f++) {
    if (f > 0) await page.evaluate(`__advance(${STEPS})`);
    const url = await page.evaluate(`document.getElementById('c').toDataURL('image/jpeg', 0.95)`);
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on('close', r));
  if (code !== 0) throw new Error('ffmpeg exited ' + code);
  const events = await page.evaluate('window.__events || []');
  writeFileSync(out.replace(/\.mp4$/, '.events.json'), JSON.stringify({ fps: FPS, events }, null, 1));
  console.log(`wrote ${out} (${frames} frames) and ${events.length} events`);
}

const gameUrl = (seed) => pathToFileURL(join(ROOT, 'game', 'index.html')).href + `?capture&demo&seed=${seed}`;
const [cmd, ...args] = process.argv.slice(2);
const page = await launch();
try {
  if (cmd === 'seeds') {
    const [seconds, first, last] = args.map(Number);
    for (let s = first; s <= last; s++) {
      await page.open(gameUrl(s));
      const info = await page.evaluate(`__advance(${Math.round(seconds * 60)}, false), __info()`);
      console.log(`seed ${s}: ${info.alive ? 'survives' : 'crashes at ' + info.t.toFixed(1) + 's'} score ${info.score} stars ${info.stars}`);
    }
  } else if (cmd === 'game') {
    const [seed, seconds, out] = args;
    await page.open(gameUrl(seed));
    await record(page, Number(seconds), resolve(out));
  } else if (cmd === 'scenes') {
    const [promptFile, sourceFile, seconds, out] = args;
    await page.open(pathToFileURL(join(ROOT, 'video', 'scenes.html')).href);
    const prompt = readFileSync(promptFile, 'utf8').trim(), source = readFileSync(sourceFile, 'utf8');
    await page.evaluate(`__setText(${JSON.stringify(prompt)}, ${JSON.stringify(source)})`);
    await record(page, Number(seconds), resolve(out));
  } else {
    console.log('usage: seeds <seconds> <first> <last> | game <seed> <seconds> <out.mp4> | scenes <prompt.txt> <source> <seconds> <out.mp4>');
  }
} finally {
  page.close();
}
