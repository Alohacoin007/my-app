// Alpexa — 플로팅 P/L quote→USD 환산 락스텝 (2026-07-19 갭감사 🔴 → 사장님 "고쳐")
//
// 사고 클래스: 클라가 엔 환산을 0.0067(엔=149 시절 고정값)로 박아두고 USDCHF/USDCAD는
// 아예 무환산 → 서버 fx_close(라이브 환율)와 플로팅이 최대 ±42% 어긋남(플로팅≠실현).
//
// MT5 형식 검증(사장님 질문): MT5 핍밸류 방식과 우리 공식은 동일 수학이다 —
//   MT5:  P/L = (거리/틱) × 틱밸류 × 랏,  틱밸류 = 틱 × 계약 × (quote→USD 현재환율)
//   우리: P/L = 거리 × 랏 × 계약 × (quote→USD 현재환율)
//   → 둘 다 (quote→USD)가 "실시간 환율"이라는 게 핵심. 0.0067은 얼어붙은 핍밸류였다.
// 이 테스트 = 서버 fx_close.sql v_pnl 분기(quote=USD/base=USD/cross)의 JS 미러 ↔
//             webtrade quoteUsd() ↔ 터미널 fxQuoteUsd() 3자 일치 + 구버전 RED 재현.
'use strict';
const fs = require('fs'), path = require('path');
let pass = true;
const ok = (n, c, d) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && d ? '  ' + d : ''}`); };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.01);

/* ── 서버 미러 (fx_close.sql:118-137) ── */
function serverPnl(sym, cls, dir, open, close, lots, rates) {
  const lot = sym === 'XAUUSD' ? 100 : sym === 'XAGUSD' ? 5000 : cls === 'FX' ? 100000 : 1;
  const pnlq = (close - open) * dir * lot * lots;
  if (cls !== 'FX') return pnlq;
  const base = sym.slice(0, 3), quote = sym.slice(3, 6);
  if (quote === 'USD') return pnlq;
  if (base === 'USD') return pnlq / close;                       // v_pnlq / v_mid
  const q2 = rates['USD' + quote] ? 1 / rates['USD' + quote] : rates[quote + 'USD'];
  return pnlq * q2;
}
/* ── 클라 신공식 미러 (webtrade quoteUsd / 터미널 fxQuoteUsd) ── */
function clientQuoteUsd(sym, cur, rates) {
  const quote = sym.slice(3, 6);
  if (quote === 'USD') return 1;
  if (sym.slice(0, 3) === 'USD') return 1 / cur;
  return rates[quote + 'USD'] || (rates['USD' + quote] ? 1 / rates['USD' + quote] : 0);
}
const clientPnl = (sym, dir, open, close, lots, rates) =>
  (close - open) * dir * lots * 100000 * clientQuoteUsd(sym, close, rates);
const oldClientPnl = (sym, dir, open, close, lots) =>
  (close - open) * dir * lots * 100000 * (sym.includes('JPY') ? 0.0067 : 1);

console.log('fx P/L quote→USD 환산 — 서버 락스텝 (RED→GREEN)');
const RATES = { GBPUSD: 1.27, USDJPY: 162.35, USDCHF: 0.8065, USDCAD: 1.4168 };

// ── RED 재현: 구버전 오차 (현 환율 기준) ──
const jOld = oldClientPnl('USDJPY', 1, 162.00, 162.35, 1), jSrv = serverPnl('USDJPY', 'FX', 1, 162.00, 162.35, 1, RATES);
ok('RED 재현: 구버전 USDJPY 1랏 +35핍 = $' + jOld.toFixed(2) + ' vs 서버 $' + jSrv.toFixed(2) + ' (약 +9% 과대)',
   jOld > jSrv * 1.05);
const cOld = oldClientPnl('USDCAD', 1, 1.4100, 1.4168, 1), cSrv = serverPnl('USDCAD', 'FX', 1, 1.4100, 1.4168, 1, RATES);
ok('RED 재현: 구버전 USDCAD 무환산 = $' + cOld.toFixed(2) + ' vs 서버 $' + cSrv.toFixed(2) + ' (약 +42% 과대)',
   cOld > cSrv * 1.3);

// ── GREEN: 신공식 == 서버, 전 분기 ──
const CASES = [
  ['EURUSD', 1, 1.1400, 1.1450, 0.5],    // quote=USD
  ['USDJPY', 1, 162.00, 162.35, 1.0],    // base=USD (JPY)
  ['USDJPY', -1, 162.35, 162.00, 0.3],   // JPY 숏
  ['USDCHF', 1, 0.8000, 0.8065, 1.0],    // base=USD (CHF)
  ['USDCAD', -1, 1.4200, 1.4168, 0.7],   // base=USD (CAD) 숏
  ['EURGBP', 1, 0.8500, 0.8530, 1.0],    // 크로스 → GBPUSD 직접환율
  ['EURJPY', 1, 185.50, 185.90, 0.2],    // 크로스 → 1/USDJPY 역수환율
];
for (const [sym, dir, o, c, lots] of CASES) {
  const cli = clientPnl(sym, dir, o, c, lots, RATES), srv = serverPnl(sym, 'FX', dir, o, c, lots, RATES);
  ok(`GREEN ${sym} ${dir > 0 ? 'BUY' : 'SELL'} ${lots}랏: 클라 $${cli.toFixed(2)} == 서버 $${srv.toFixed(2)}`, near(cli, srv));
}

// ── MT5 핍밸류 등가 증명: 틱밸류 경유 계산 == 우리 공식 ──
{ const pip = 0.01, lots = 1, pips = 35;                                   // USDJPY 1랏 35핍
  const pipValue = pip * 100000 * (1 / 162.35);                            // MT5 핍밸류 = 틱×계약×(quote→USD 현재환율) = $6.16
  const mt5 = pips * pipValue * lots;
  const ours = clientPnl('USDJPY', 1, 162.00, 162.35, lots, RATES);
  ok('MT5 핍밸류 방식(35핍 × $' + pipValue.toFixed(2) + ') == 우리 공식 ($' + mt5.toFixed(2) + ' vs $' + ours.toFixed(2) + ')', near(mt5, ours, 0.05)); }

// ── fail-safe: 크로스 기준환율 없으면 0 (가짜 환산 금지 — 서버도 거절하는 케이스) ──
ok('크로스 환율 부재 → 환산 0 (가짜 금지)', clientQuoteUsd('EURNOK', 11.5, {}) === 0);

// ── 소스 핀: 세 화면에서 0.0067 제거 + 신 헬퍼 존재 ──
const wt = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
const fxt = fs.readFileSync(path.join(__dirname, '..', 'dev', 'fx-terminal.html'), 'utf8');
const tr = fs.readFileSync(path.join(__dirname, '..', 'trading.html'), 'utf8');
ok('webtrade: 0.0067 고정값 제거 + quoteUsd 라이브 환산', !/\?0\.0067:1/.test(wt) && /function quoteUsd\(/.test(wt) && /quoteUsd\(p\.symbol, cur\)/.test(wt));
ok('터미널: 0.0067 고정값 제거 + fxQuoteUsd 라이브 환산', !/\?0\.0067:1/.test(fxt) && /function fxQuoteUsd\(/.test(fxt) && (fxt.match(/fxQuoteUsd\(/g)||[]).length >= 3);
ok('trading(모바일): 애초에 0.0067 없음 (라이브 환산 유지)', !/0\.0067/.test(tr));

console.log(pass ? '🟢 fx-pnl-quote-usd — all green' : '🔴 fx-pnl-quote-usd FAILED');
process.exit(pass ? 0 : 1);
