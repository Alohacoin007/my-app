#!/usr/bin/env node
// Alpexa — crypto/prices feed morning check (run me, don't wait for a customer).
//
// Reads the LIVE `prices` table (what balances, trades and settlements use) and checks:
//   • FROZEN feeds — a symbol not updated for too long. Crypto trades 24/7 (~3s cadence),
//     so a stale crypto price = a stopped/delisted feed (this is how TON/MKR froze ~35h
//     when Binance delisted them). FX/stocks have market hours → judged leniently.
//   • ALPXS present + priced (missing ALPXS = crypto balances read $0 — a real bug we hit).
//   • Sanity — no mid ≤ 0 / null.
//
// FAILS (exit 1 → daily workflow emails owner) only on real problems: whole feed dead,
// a 24/7 crypto MAJOR frozen, ALPXS missing/zero, or any non-positive price. Individual
// long-tail frozen coins are ⚠️ warnings (review → delete the delisted ones).
//
//   node tests/crypto-feed-check.js
// Exit: 0 = healthy / network unavailable · 1 = real problems.

const URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';

// Crypto majors that trade 24/7 — MUST be fresh. If one of these freezes, act now.
const CRYPTO_MAJORS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'];
const FRESH_MIN = 15;   // a 24/7 crypto price older than this = frozen (real problem)
const FROZEN_MIN = 60;  // any symbol older than this = flag for review (delisted?)

const FX = new Set(['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCHF','USDCAD','NZDUSD','EURJPY','EURGBP','GBPJPY','EURAUD','AUDJPY','CHFJPY','EURCHF','USDKRW','USDCNH','USDSGD','USDMXN','XAUUSD','XAGUSD']);
// `syms` = the set of ALL price symbols, used to pair up crypto (a coin writes both
// "BTC" and "BTCUSD", so either one whose partner exists is crypto; a bare ticker like
// AAPL with no AAPLUSD is a stock).
function category(sym, syms) {
  if (sym === 'ALPXS') return 'ALPXS';
  if (FX.has(sym)) return 'FX';
  if (/^(USDT|USDC|DAI)$/.test(sym) || CRYPTO_MAJORS.includes(sym)) return 'CRYPTO';
  if (/USD$/.test(sym) && syms.has(sym.replace(/USD$/, ''))) return 'CRYPTO';  // BTCUSD ← BTC exists
  if (syms.has(sym + 'USD')) return 'CRYPTO';                                   // BTC ← BTCUSD exists
  if (/^[A-Z]{1,6}$/.test(sym)) return 'STOCK';                                 // AAPL (no AAPLUSD)
  return 'CRYPTO';
}

async function main() {
  let rows;
  try {
    const r = await fetch(`${URL}/rest/v1/prices?select=symbol,mid,updated_at`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    rows = await r.json();
  } catch (e) {
    console.log('⏭  SKIP — Supabase 접근 불가 (' + e.message + '). 네트워크 열린 곳에서 실행.');
    process.exit(0);
  }

  const now = Date.now();
  const ageMin = (r) => r.updated_at ? (now - new Date(r.updated_at).getTime()) / 60000 : Infinity;
  const freshest = Math.min(...rows.map(ageMin));

  console.log('── 크립토/가격 피드 아침 점검 ─────────────────────────');
  console.log(`  prices ${rows.length}개 · 최신 갱신 ${isFinite(freshest) ? freshest.toFixed(1) + '분 전' : '?'}`);

  const fails = [], warns = [];
  if (!rows.length) { console.log('  🔴 prices 비어있음 — 전 자산 시세 없음.'); process.exit(1); }
  if (freshest > FRESH_MIN) fails.push(`전체 피드 STALE — 가장 최신도 ${freshest.toFixed(0)}분 전 (크론 멈춤?)`);

  const bySym = {}; rows.forEach((r) => { bySym[r.symbol] = r; });
  const syms = new Set(rows.map((r) => r.symbol));
  const cat = { CRYPTO: 0, FX: 0, STOCK: 0, ALPXS: 0 };
  const bad = [], frozen = [];
  for (const r of rows) {
    cat[category(r.symbol, syms)]++;
    if (!(+r.mid > 0)) bad.push(r.symbol);
    if (ageMin(r) > FROZEN_MIN) frozen.push({ s: r.symbol, m: Math.round(ageMin(r)) });
  }

  // hard checks
  if (bad.length) fails.push(`시세 0/음수/null: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? ` 외 ${bad.length - 8}` : ''}`);
  for (const m of CRYPTO_MAJORS) {
    const r = bySym[m];
    if (!r) fails.push(`크립토 메이저 없음: ${m}`);
    else if (ageMin(r) > FRESH_MIN) fails.push(`크립토 메이저 FROZEN: ${m} (${Math.round(ageMin(r))}분 전)`);
  }
  const alpxs = bySym['ALPXS'];
  if (!alpxs) fails.push('ALPXS 없음 — 크립토 잔고 $0로 뜸');
  else if (!(+alpxs.mid > 0)) fails.push('ALPXS 시세 0');

  // frozen (delisted?) — warn, list for review
  const cryptoFrozen = frozen.filter((f) => category(f.s, syms) === 'CRYPTO');
  if (cryptoFrozen.length) warns.push('멈춘 크립토(상폐 의심 → 삭제 검토): ' + cryptoFrozen.map((f) => `${f.s}(${f.m}m)`).join(', '));

  console.log(`  분류: CRYPTO ${cat.CRYPTO} · FX ${cat.FX} · STOCK ${cat.STOCK} · ALPXS ${cat.ALPXS}` + (alpxs ? ` (ALPXS $${(+alpxs.mid).toFixed(2)})` : ''));
  warns.forEach((w) => console.log('  ⚠️ ' + w));

  console.log('');
  if (fails.length) { console.log('  🔴 문제 ' + fails.length + '건:'); fails.forEach((f) => console.log('     - ' + f)); process.exit(1); }
  console.log('  🟢 이상 없음 — 크립토 메이저·ALPXS 신선, 시세 정상.' + (warns.length ? ' (경고는 검토용)' : ''));
  process.exit(0);
}
main();
