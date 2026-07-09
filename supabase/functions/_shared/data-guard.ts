// Alpexa — DATA INGESTION GUARD (real-time feed integrity)
// ============================================================================
// Shared by the price/odds Edge functions (crypto-prices, fx-prices, sports-games,
// sports-odds) to (1) reject bad ticks BEFORE they are written to `prices`/`live_games`,
// and (2) trip a per-instrument circuit breaker when a feed goes stale/frozen so the
// consuming money RPCs lock that symbol's trading/betting.
//
// ⚠️ Two calibration facts baked in, learned from this codebase:
//  • Staleness threshold is CONFIGURABLE per feed. A literal 10s gate on a ~60s cron feed
//    would mark every tick stale and lock ALL trading. 10s is correct ONLY for a truly
//    sub-10s feed. Defaults below are safe multiples of each feed's real cadence; tune to
//    the feed you wire this into. (crypto_trade already uses 120s server-side.)
//  • Negative is INVALID for prices (FX/crypto mid must be > 0) but VALID for American odds
//    (-140 is a normal favorite). Use validPrice() for prices, validAmericanOdds() for odds.
// ============================================================================

export interface Tick { value: number; ts: number; } // ts = epoch ms of the source update

// ── 1) freshness / freeze detection ──
export function ageMs(ts: number, now: number): number { return now - ts; }
export function isFresh(ts: number, now: number, maxAgeMs: number): boolean {
  return Number.isFinite(ts) && ageMs(ts, now) <= maxAgeMs && ageMs(ts, now) >= 0;
}
// Safe per-feed defaults (ms). NOT 10s — that would lock a cron feed. Override per call.
export const MAX_AGE: Record<string, number> = {
  crypto: 30_000,   // crypto mid — sub-minute feed; lock if > 30s
  fx:     30_000,   // fx rate
  sports: 180_000,  // sports odds/lines update slowly; lock if > 3m
  default:120_000,
};

// ── 2) value validation + outlier filter ──
export function validPrice(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;   // price/rate must be > 0
}
export function validAmericanOdds(am: unknown): boolean {
  // American odds are negative for favorites (-140) — never reject on sign. Reject 0,
  // non-finite, and impossible magnitudes ( -100 < am < 100 can't be American odds ).
  return typeof am === 'number' && Number.isFinite(am) && am !== 0 && Math.abs(am) >= 100;
}
// abnormal spike/crash vs the last good value → treat as bad tick, ignore it.
export function isOutlier(prev: number, next: number, maxPct = 0.5): boolean {
  if (!Number.isFinite(prev) || prev === 0) return false;         // no baseline yet → accept
  return Math.abs(next - prev) / Math.abs(prev) > maxPct;         // > 50% move = outlier
}

// ── 3) circuit breaker (per instrument) ──
export class CircuitBreaker {
  private tripped = new Set<string>();
  private reason = new Map<string, string>();
  trip(sym: string, why: string){ this.tripped.add(sym); this.reason.set(sym, why); }
  reset(sym: string){ this.tripped.delete(sym); this.reason.delete(sym); }
  isTripped(sym: string){ return this.tripped.has(sym); }
  why(sym: string){ return this.reason.get(sym) || ''; }
  // Feed one tick through the guard; returns the accepted value or null (rejected → symbol
  // stays locked). prev = last accepted value for outlier comparison; kind picks the validator.
  ingest(sym: string, tick: Tick, now: number, opts: { kind: 'price'|'odds'; maxAgeMs: number; prev?: number }): number | null {
    if (!isFresh(tick.ts, now, opts.maxAgeMs)) { this.trip(sym, `stale ${ageMs(tick.ts, now)}ms`); return null; }
    const valid = opts.kind === 'odds' ? validAmericanOdds(tick.value) : validPrice(tick.value);
    if (!valid) { this.trip(sym, `invalid ${opts.kind} ${tick.value}`); return null; }
    if (opts.prev !== undefined && isOutlier(opts.prev, tick.value)) { this.trip(sym, `outlier ${opts.prev}→${tick.value}`); return null; }
    this.reset(sym);   // good tick → unlock
    return tick.value;
  }
}
