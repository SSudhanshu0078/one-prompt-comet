// Synthesises the video's soundtrack as a WAV, no samples: a 120 bpm synthwave loop that builds
// beat by beat, key clicks while the prompt types, and a chime on every star the comet grabs.
//   node video/soundtrack.mjs <scenes.events.json> <game.events.json> <seconds> <out.wav>
// The cut it scores (kept in step with the ffmpeg edit):
//   0.0 - 3.0   hook: game footage from 14 s to 17 s
//   3.0 - 15.5  scenes: the prompt (3.0 - 7.5), the agent writing code (7.5 - 15.5)
//   15.5 - end  the result: game footage from 0 s
import { readFileSync, writeFileSync } from 'node:fs';

const [scenesEv, gameEv, secondsArg, out] = process.argv.slice(2);
const RATE = 44100, SECONDS = Number(secondsArg), N = Math.round(RATE * SECONDS);
const L = new Float32Array(N), R = new Float32Array(N);
const BEAT = 0.5; // 120 bpm

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
function add(t0, dur, gain, pan, fn) {
  const s0 = Math.max(0, Math.round(t0 * RATE)), s1 = Math.min(N, Math.round((t0 + dur) * RATE));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / RATE, v = fn(t) * gain;
    L[i] += v * (1 - pan) ; R[i] += v * (1 + pan);
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const square = (ph) => (ph % 1 < 0.5 ? 1 : -1) * 0.6;
const saw = (ph) => 2 * (ph % 1) - 1;
let noiseSeed = 1;
const noise = () => { noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff; return noiseSeed / 0x3fffffff - 1; };

// Am - F - C - G, one chord a bar (2 s)
const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const section = (t) => (t < 3 ? 'hook' : t < 7.5 ? 'prompt' : t < 15.5 ? 'code' : 'result');

for (let beat = 0; beat * BEAT < SECONDS; beat++) {
  const t = beat * BEAT, sec = section(t), chord = chords[Math.floor(t / 2) % 4];
  const drums = sec !== 'prompt';
  // kick on every beat, hats between, clap on 2 and 4
  if (drums) {
    add(t, 0.35, 0.9, 0, (x) => Math.sin(2 * Math.PI * (50 * x + 90 * (1 - Math.exp(-x * 30)) / 30)) * env(x, 0.002, 0.12));
    add(t + BEAT / 2, 0.06, 0.18, 0.2, () => noise() * 1) ;
    if (beat % 2 === 1) add(t, 0.18, 0.28, -0.1, (x) => noise() * env(x, 0.002, 0.05));
  }
  // bass on eighths
  for (let e = 0; e < 2; e++) {
    const f = hz(chord[0] - 24);
    add(t + e * BEAT / 2, BEAT / 2, sec === 'prompt' ? 0.18 : 0.32, 0, (x) => saw(f * x) * env(x, 0.005, 0.18));
  }
  // arpeggio on sixteenths, from the code beat on
  if (sec === 'code' || sec === 'result' || sec === 'hook') {
    for (let s = 0; s < 4; s++) {
      const note = chord[(beat * 4 + s) % 3] + (s === 3 ? 12 : 0) + 12, f = hz(note);
      add(t + s * BEAT / 4, BEAT / 4, sec === 'code' ? 0.07 : 0.1, s % 2 ? 0.4 : -0.4, (x) => square(f * x) * env(x, 0.003, 0.07));
    }
  }
  // a soft pad under the prompt
  if (sec === 'prompt' && beat % 4 === 0) {
    for (const n of chord) { const f = hz(n); add(t, 2, 0.06, 0, (x) => (saw(f * x) + saw(f * 1.006 * x)) * 0.5 * Math.min(1, x / 0.3) * Math.min(1, (2 - x) / 0.3)); }
  }
}

// key clicks while the prompt types (scenes time + 3.0 s)
const sceneEvents = JSON.parse(readFileSync(scenesEv, 'utf8')).events;
sceneEvents.filter((e) => e.type === 'key').forEach((e, i) => {
  if (i % 2) return;
  add(3.0 + e.t, 0.03, 0.22, (i % 7) / 7 - 0.5, (x) => noise() * env(x, 0.0005, 0.008));
});

// chimes for stars, a whoosh for each speed-up (game frames are 60 Hz)
const gameEvents = JSON.parse(readFileSync(gameEv, 'utf8')).events;
for (const e of gameEvents) {
  const gt = e.frame / 60;
  const times = [];
  if (gt >= 14 && gt < 17) times.push(gt - 14);
  if (15.5 + gt < SECONDS) times.push(15.5 + gt);
  for (const vt of times) {
    if (e.type === 'star') [76, 83, 88].forEach((n, k) => add(vt + k * 0.05, 0.4, 0.16, 0.2, (x) => Math.sin(2 * Math.PI * hz(n) * x) * env(x, 0.002, 0.12)));
    if (e.type === 'speedup') add(vt - 0.3, 1.0, 0.25, 0, (x) => noise() * Math.sin(Math.PI * x) * 0.6);
  }
}

// master: fade the last half second, normalise to -1 dBFS, write 16-bit stereo PCM
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (RATE * 0.5));
  L[i] = Math.tanh(L[i] * fade); R[i] = Math.tanh(R[i] * fade);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.89 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4);
}
writeFileSync(out, buf);
console.log(`wrote ${out}: ${SECONDS} s, ${gameEvents.length} game events, ${sceneEvents.length} key events`);
