#!/usr/bin/env node
// Alpexa — 트레일링 스탑 (PC 웹트레이드 · 모바일 FX) (2026-11-17 앱 분석 4단계 #3, 승인: 사장님 "FX 거래 관리 진행해")
// ============================================================================
// 방식 = MT5 와 같다: **앱이 켜져 있는 동안** 앱이 손절가(SL)를 시세 뒤로 따라 올린다. 서버 변경 없음 —
//   손절가를 옮기는 길은 이미 있는 fx_modify 하나뿐이고, 실제 손절 집행은 지금처럼 서버(fx_sltp 크론)가 한다.
// 불변식:
//   ① 손절가는 **유리한 쪽으로만** 움직인다 (BUY 는 올라가기만 · SELL 은 내려가기만). 시세가 되돌아와도 물러서지 않는다.
//   ② 이익이 설정 거리만큼 난 뒤에만 시작한다 → 트레일링이 놓는 손절가는 항상 진입가보다 불리하지 않다 (본전 이상).
//   ③ 손절가는 항상 현재가 뒤 "거리"만큼 — 시장 반대편(서버가 거절하는 쪽)에 놓지 않는다.
//   ④ 판정 함수(trailNext)는 두 앱에서 **글자 그대로 같다** (한쪽만 고치는 사고 방지).
//   ⑤ 보내기 직전에 서버에서 그 포지션을 다시 읽는다 — 다른 기기에서 바꾼 TP 를 옛 값으로 덮어쓰지 않고,
//      이미 닫힌 포지션이면 추적을 끝낸다.
//   ⑥ 시세가 끊겼거나 낡았으면 아무것도 보내지 않는다. 데모·로그아웃 상태에서도 보내지 않는다.
// 설정(포지션별 거리)은 sessionStorage 에 둔다 — 돈이 아니라 "이 창이 켜져 있는 동안"의 지시다 (탭을 닫으면 끝).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const wt = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8'), fa = fs.readFileSync(path.join(REPO, 'fx-app.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grabFn = (src, name) => { const m = src.match(new RegExp('(async )?function ' + name + '\\(')); if (!m) return '';
  const i = m.index; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };
const grabObj = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

const fW = grabFn(wt, 'trailNext'), fM = grabFn(fa, 'trailNext');
ok('trailNext 가 두 앱에 있다', !!(fW && fM), JSON.stringify({ webtrade: !!fW, fxapp: !!fM }));
ok('④ 두 앱의 trailNext 는 글자 그대로 같다', !!fW && fW === fM);

// ── 행위: 판정 함수 ───────────────────────────────────────────────────────────
if (fW) {
  const trailNext = new Function(fW + '\nreturn trailNext;')();
  const B = (bid, sl) => trailNext('BUY', 1.1, bid, bid + 0.0001, sl, 0.002, 0.0002, 5);       // 진입 1.10000 · 거리 20핍 · 최소 이동 2핍
  const S = (ask, sl) => trailNext('SELL', 1.1, ask - 0.0001, ask, sl, 0.002, 0.0002, 5);
  ok('BUY ② 이익 10핍(거리 20핍 미만) → 시작 안 함', B(1.1010, null) === null);
  ok('BUY ② 이익이 딱 20핍 → 손절가 = 진입가(본전)', B(1.1020, null) === 1.1);
  ok('BUY ③ 이익 50핍 · 손절 없음 → 현재가 − 20핍 (1.10300)', B(1.1050, null) === 1.103);
  ok('BUY    손절가가 이미 그 자리 → 보내지 않는다', B(1.1050, 1.103) === null);
  ok('BUY    1핍만 더 유리 (최소 이동 2핍 미만) → 보내지 않는다 (서버 호출 남발 방지)', B(1.1051, 1.103) === null);
  ok('BUY    2핍 더 유리 → 1.10320 으로 올린다', B(1.1052, 1.103) === 1.1032);
  ok('BUY ① 시세가 되돌아와도(1.1040) 손절가를 내리지 않는다', B(1.1040, 1.1032) === null);
  ok('SELL ② 이익 10핍 → 시작 안 함 · 20핍 → 본전', S(1.0990, null) === null && S(1.0980, null) === 1.1);
  ok('SELL ③ 이익 50핍 · 손절 없음 → 현재가 + 20핍 (1.09700)', S(1.0950, null) === 1.097);
  ok('SELL    2핍 더 유리 → 1.09680 으로 내린다 · 1핍은 안 보낸다', S(1.0948, 1.097) === 1.0968 && S(1.0949, 1.097) === null);
  ok('SELL ① 시세가 되돌아와도 손절가를 올리지 않는다', S(1.0960, 1.0968) === null);
  ok('잘못된 입력(거리 0 · 시세 0 · 진입가 0 · 음수)은 아무것도 안 한다',
     trailNext('BUY', 1.1, 1.2, 1.2, null, 0, 0.0002, 5) === null && trailNext('BUY', 1.1, 0, 0, null, 0.002, 0.0002, 5) === null &&
     trailNext('BUY', 0, 1.2, 1.2, null, 0.002, 0.0002, 5) === null && trailNext('BUY', 1.1, 1.2, 1.2, null, -1, 0.0002, 5) === null);
  ok('반올림은 불리하지 않은 쪽으로: BUY 내림(1.103019 → 1.10301) · SELL 올림(1.096981 → 1.09699)',
     trailNext('BUY', 1.1, 1.105019, 1.1051, null, 0.002, 0.0002, 5) === 1.10301 && trailNext('SELL', 1.1, 1.0949, 1.094981, null, 0.002, 0.0002, 5) === 1.09699);
  ok('사용자가 더 유리한 손절가를 직접 걸어 둔 경우(BUY SL 1.1040 > 후보 1.1030) → 건드리지 않는다', B(1.1050, 1.104) === null);

  // 성질 테스트: 무작위 시세 5,000틱 × 40회 — ①②③ 이 한 번도 깨지지 않는다
  let viol = '', moves = 0, seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let run = 0; run < 40 && !viol; run++) {
    const buy = run % 2 === 0, open = 1 + rnd(), dist = 0.0005 + rnd() * 0.004, step = Math.max(0.0001, dist / 10), half = 0.00005 + rnd() * 0.0001;
    let mid = open, sl = null;
    for (let i = 0; i < 5000 && !viol; i++) {
      mid += (rnd() - 0.5) * 0.0006; const bid = mid - half, ask = mid + half;
      const n = trailNext(buy ? 'BUY' : 'SELL', open, bid, ask, sl, dist, step, 5);
      if (n == null) continue; moves++;
      if (sl != null && (buy ? n <= sl : n >= sl)) viol = `① 불리한 쪽 이동 run${run} ${sl}→${n}`;
      else if (buy ? n < open - 1e-9 : n > open + 1e-9) viol = `② 진입가보다 불리 run${run} open ${open} sl ${n}`;
      else if (buy ? n > bid - dist + 1e-9 : n < ask + dist - 1e-9) viol = `③ 거리보다 가까움 run${run} px ${buy ? bid : ask} sl ${n} dist ${dist}`;
      else if (buy ? n >= mid : n <= mid) viol = `③ 시장 반대편 run${run}`;
      sl = n;
    }
  }
  ok(`성질 ①②③: 무작위 시세 20만 틱에서 위반 0 (손절 이동 ${moves}회)`, !viol && moves > 100, viol);
}

// ── 정적: 두 앱의 엔진 ────────────────────────────────────────────────────────
const eW = grabObj(wt, 'const trailStore = {'), eM = grabFn(fa, 'trailTick');
ok('엔진을 찾았다 (webtrade trailStore · fx-app trailTick)', !!(eW && eM), JSON.stringify({ webtrade: !!eW, fxapp: !!eM }));
ok('webtrade: 손절가는 fx_modify 로만 옮긴다 (엔진 안의 서버 호출 = fx_modify 1곳 · 테이블 쓰기 0)',
   !!eW && (eW.match(/\.rpc\('/g) || []).length === 1 && /\.rpc\('fx_modify',/.test(eW) && !/\.(insert|update|upsert|delete)\(/.test(eW));
ok('webtrade ⑤: 보내기 직전에 서버에서 그 포지션을 다시 읽고(SELECT) 그 값으로 다시 판정한다',
   !!eW && /from\('positions'\)\.select\('local_id,side,open_price,meta'\)[\s\S]{0,200}\.eq\('local_id',/.test(eW) && (eW.match(/trailNext\(/g) || []).length === 2);
ok('webtrade ⑥: 데모·로그아웃·시세 끊김·장 마감이면 보내지 않는다',
   !!eW && /WT_DEMO/.test(eW) && /AlpexaSync\.me/.test(eW) && /priceStore\.feedDown\(\)/.test(eW) && /marketOpen\(/.test(eW));
ok('webtrade: 설정은 sessionStorage (돈 아님 · 이 창이 켜져 있는 동안) — localStorage 에 두지 않는다',
   !!eW && /sessionStorage\.setItem\(this\.KEY/.test(eW) && !/localStorage/.test(eW));
ok('fx-app: 손절가는 fx_modify 로만 옮긴다 (엔진 안의 서버 호출 = rpc fx_modify 1곳 · 테이블 쓰기 0)',
   !!eM && (eM.match(/rpc\('/g) || []).length === 1 && /rpc\('fx_modify',/.test(eM) && !/\.(insert|update|upsert|delete)\(/.test(eM));
ok('fx-app ⑤: 보내기 직전에 서버에서 그 포지션을 다시 읽고 그 값으로 다시 판정한다',
   !!eM && /from\('positions'\)\.select\('local_id,side,open_price,meta'\)[\s\S]{0,200}\.eq\('local_id',/.test(eM) && (eM.match(/trailNext\(/g) || []).length === 2);
ok('fx-app ⑥: 시세가 낡았으면(isFresh 아님) · 다른 요청 중이면 보내지 않는다', !!eM && /isFresh\(/.test(eM) && /S\.busy/.test(eM));
ok('fx-app: 설정은 sessionStorage — localStorage 에 두지 않는다', /sessionStorage\.setItem\('alpexa\.fx\.trail'/.test(fa) && !/localStorage\.setItem\('alpexa\.fx\.trail'/.test(fa));
ok('두 앱 모두 화면에 "앱/창이 켜져 있는 동안만" 이라고 알린다', /only while this window is open/i.test(wt) && /only while the app is open/i.test(fa));

console.log(`\n${fail ? '🔴' : '🟢'} fx-trailing-stop — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
