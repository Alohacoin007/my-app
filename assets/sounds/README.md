# webtrade.html — MT5 order-lifecycle sounds

`webtrade.html` preloads four HTML5 `Audio` clips from this folder and plays one at
each order-lifecycle moment. **Drop the MT5 original `.wav` files here with these exact
names** (served from the site root as `/assets/sounds/…`):

| File           | Plays when…                                             | Audio object   |
|----------------|---------------------------------------------------------|----------------|
| `ok.wav`       | `fx_open` succeeds — order entered (also demo fill)     | `sndOpen`      |
| `connect.wav`  | `fx_close` succeeds — position closed                   | `sndClose`     |
| `timeout.wav`  | RPC error / margin gate rejection                       | `sndError`     |
| `stops.wav`    | 30% stop-out cron force-liquidates a position           | `sndStopout`   |

Notes:
- **Each event has a built-in WebAudio fallback tone**, so sound works out of the box
  even before you add any file. Drop a `.wav` here and it auto-swaps to the real MT5
  clip on next load (detected via the audio element's `loadeddata`/`canplaythrough`).
- Playback is fire-and-forget — a **missing/blocked file never breaks a fill**.
- Browsers block audio until the first user gesture; `webtrade.html` unlocks all four
  clips on the first `pointerdown`/`keydown` (volume-0 play→pause), so sounds that fire
  ~250–550 ms after the click (past the ECN delay) still play.
- Any format the browser can decode works if you keep the filename; `.wav` is the
  standard here to match the MT5 originals.
