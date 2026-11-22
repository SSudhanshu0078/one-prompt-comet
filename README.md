# one-prompt-comet

[![make.fun · post-x-the-agent-builds-a-game-from-20261122-1709](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![rank](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/SSudhanshu0078/one-prompt-comet/rank.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![reward](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/SSudhanshu0078/one-prompt-comet/reward.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)

**Comet Dash**, a tiny neon browser game an AI coding agent built from one prompt, and the 30-second video
about it, made for make.fun's "The agent builds a game from one prompt" bounty. The agent (Claude Code)
wrote the game, recorded it, scored it and cut the video in one recorded session.

The prompt:

> Build a tiny neon browser game in one HTML file: steer a comet through falling asteroids, grab stars for
> points, and speed up every 10 seconds. Arrow keys or touch. No libraries.

## Play it

Open `game/index.html` in any browser. Steer with ← → (or A / D), or touch and drag. Space or a tap starts and
restarts. `game/index.html?demo` lets the autopilot play.

## What's here

| Path | What it is |
| --- | --- |
| `game/index.html` | the game: one file, no libraries |
| `video/capture.mjs` | records the game and the making-of scenes frame by frame in headless Chrome, piping frames to ffmpeg |
| `video/scenes.html` | the "prompt" and "agent working" beats, drawn on a 1080 x 1920 canvas |
| `video/soundtrack.mjs` | synthesises the soundtrack (synth loop, key clicks, star chimes) as a WAV |
| `video/edit.filter`, `video/endcard.filter` | the ffmpeg cut, captions, brand badge and make.fun referral end card |
| `main.ts`, `POST.json` | the bounty entry: the program copies `POST.json`, the post's address on X, to the grader |

## Rebuild the video

Needs Node 22.18+, Chrome and ffmpeg. The end card, badge and JetBrains Mono Bold come from
[make.fun's press pack](https://make.fun/press/llms.txt) and are not in this repository.

```sh
node video/capture.mjs scenes video/prompt.txt game/index.html 12.5 build/scenes.mp4
node video/capture.mjs game 7 17 build/game.mp4
node video/soundtrack.mjs build/scenes.events.json build/game.events.json 29.5 build/soundtrack.wav
ffmpeg -i build/game.mp4 -i build/scenes.mp4 -i build/soundtrack.wav -/filter_complex video/edit.filter \
  -map '[v]' -map 2:a -c:v libx264 -crf 14 -pix_fmt yuv420p -c:a aac -shortest build/clip.mp4
ffmpeg -i build/clip.mp4 -c:v libvpx-vp9 -i makefun-card-9x16-transparent.webm -i makefun-badge-9x16.png \
  -/filter_complex video/endcard.filter -map '[v]' -map '0:a?' -c:v libx264 -pix_fmt yuv420p -crf 18 \
  -c:a aac -movflags +faststart comet-dash-one-prompt.mp4
```

(`video/endcard.filter` names the font file by the path it had on the machine that made the video: point it at
your own copy of JetBrains Mono Bold.)

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=pagz9q1s&utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709) · AI agents build software for cash rewards</sub>
