// Alpexa — THROTTLE for the price broadcast/write layer.
// ============================================================================
// External feeds can tick dozens of times/sec. Writing each tick to `prices`/`live_games`
// (which drives every client's realtime event / poll) would storm the clients and the DB.
// This caps the publish rate to at most 1 per intervalMs (default 400ms ≈ 2.5/sec) with a
// TRAILING edge, so the newest value in the window is not lost — it's published when the
// window opens. Wrap the "write to table / broadcast" call with this.
// ============================================================================

export function throttle<A extends unknown[]>(
  fn: (...args: A) => void, intervalMs = 400, clock: () => number = Date.now,
) {
  let last = 0;
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => { last = clock(); const a = pending!; pending = null; timer = null; fn(...a); };

  return (...args: A) => {
    const now = clock();
    const wait = intervalMs - (now - last);
    if (wait <= 0) { last = now; fn(...args); return; }   // window open → publish immediately
    pending = args;                                        // within window → keep newest, publish at edge
    if (!timer) timer = setTimeout(fire, wait);
  };
}

// rateLimited(intervalMs): a predicate that returns true at most once per window — handy when
// you just need to gate work without wrapping a function. `now` injectable for tests.
export function rateGate(intervalMs = 400) {
  let last = -Infinity;
  return (now: number = Date.now()): boolean => {
    if (now - last >= intervalMs) { last = now; return true; }
    return false;
  };
}
