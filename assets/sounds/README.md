# webtrade.html — MT5 order-lifecycle sounds

`webtrade.html` preloads five HTML5 `Audio` clips from this folder and plays one at
each lifecycle moment. **Drop the MT5 original `.wav` files here with these exact
names** (served from the site root as `/assets/sounds/…`):

| File            | Plays when…                                              | Audio object   |
|-----------------|----------------------------------------------------------|----------------|
| `startup.wav`   | login succeeds — "띠리링~" (once per login via flag)       | `sndLogin`     |
| `ok.wav`        | `fx_open` succeeds — order entered ("철컥")                | `sndOpen`      |
| `close.wav`     | `fx_close` succeeds — position closed ("딩~")             | `sndClose`     |
| `timeout.wav`   | RPC error / margin gate / market-closed rejection ("뚜엑") | `sndError`     |
| `stops.wav`     | 30% stop-out cron force-liquidates a position            | `sndStopout`   |

> ⚠️ **This folder currently has NO `.wav` files** — so every sound plays its built-in
> WebAudio **fallback tone** (synth). Drop the real `.wav` files here with the exact
> names above and they auto-swap to the real MT5 clips on the next load.

Notes:
- **Each event has a built-in WebAudio fallback tone**, so sound works out of the box
  even before you add any file. Detected via `loadeddata`/`canplaythrough`.
- Playback is fire-and-forget — a **missing/blocked file never breaks a fill**.
- **Mobile (iOS Safari / Android Chrome WebView)** blocks audio until the first user
  gesture; `webtrade.html` unlocks **all five** clips on the first
  `touchstart`/`pointerdown`/`click`/`keydown` (volume-0 play→pause + AudioContext
  resume), so a sound that fires from an async RPC callback plays in ~0.1s.
- Order/close sounds fire from the **real RPC success callbacks** (`fx_open` /
  `fx_close`), so they mark the moment the position actually lands / closes on the server.
