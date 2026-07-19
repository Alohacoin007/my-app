// Alpexa — 정산 규칙 A(조기 패배 확정)·B(연기 48h void) (2026-07-19 사장님 승인)
//
// 사고: SP-100058 팔레이 — KC leg는 확정 패배(2-3), VAN@CHI leg는 경기 미개최(결과 부재).
// 구버전은 "전 leg 최종"만 정산 → 연기 경기 하나로 티켓 무한 대기 (KC 패배로 이미 죽었는데도).
// 규칙 A: 확정 패배 leg 존재 → 즉시 LOST. 규칙 B: 킥오프+48h && 6일 증명창 안 → leg void(배당 1.0).
// 이 테스트 = supabase/functions/sports-settle/index.ts 정산 루프 미러.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

const H = 3600e3, D = 86400000;
const VOID_AFTER_MS = 48 * H, PROVABLE_MS = 6 * D;
const decOf = (l) => { const am = +l.am || 0; return am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am); };

/* ── 구버전 판정(사고 당시): 전 leg 최종이어야만 정산 ── */
function settleOld(legs, results, gradeOf) {
  let allDone = true, anyLost = false, decMul = 1;
  for (const l of legs) {
    const r = results[l.gid]; if (!r) { allDone = false; break; }
    const g = gradeOf(l, r); if (g === null) { allDone = false; break; }
    if (g === 'lost') anyLost = true; else if (g === 'won') decMul *= decOf(l);
  }
  if (!allDone) return { state: 'open' };
  return { state: 'settled', won: !anyLost, mult: decMul };
}
/* ── 신버전(index.ts 미러 — 여기 바꾸면 Edge도 같이) ── */
function settleNew(legs, results, gradeOf, now) {
  let anyLost = false, pending = 0, decMul = 1; const legR = [];
  for (const l of legs) {
    let g = null;
    const r = results[l.gid];
    if (!r) {
      const kt = Date.parse(l.kt || '');
      const age = isNaN(kt) ? NaN : now - kt;
      if (!isNaN(age) && age > VOID_AFTER_MS && age < PROVABLE_MS) g = 'void';
      else { pending++; legR.push('pending'); continue; }
    } else {
      g = gradeOf(l, r);
      if (g === null) { pending++; legR.push('pending'); continue; }
    }
    if (g === 'lost') anyLost = true; else if (g === 'won') decMul *= decOf(l);
    legR.push(g);
  }
  if (!anyLost && pending > 0) return { state: 'open', legR };
  return { state: 'settled', won: !anyLost, mult: anyLost ? 0 : decMul, legR };
}

console.log('settle 규칙 A(조기 패배)·B(연기 void) — RED→GREEN');
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const grade = (l, r) => r.g;   // 테스트용: 결과에 판정 내장

// ── SP-100058 미러: KC 확정 패배 + VAN 결과 부재(킥오프 2일 전 — 아직 void 창 전) ──
const LEGS_100058 = [
  { gid: 'SOC_KC', sel: 'Kansas City ML', am: 570, kt: iso(-2 * D) },
  { gid: 'SOC_VAN', sel: 'Vancouver ML', am: 158, kt: iso(-2 * D) } ];
const RES_KC_LOST = { SOC_KC: { g: 'lost' } };   // VAN 결과 없음
ok('RED 재현: 구버전 — 패배 확정인데도 무한 대기(open)', settleOld(LEGS_100058, RES_KC_LOST, grade).state === 'open');
const A = settleNew(LEGS_100058, RES_KC_LOST, grade, now);
ok('GREEN 규칙A: 패배 leg 확정 → 즉시 LOST (pending 무시)', A.state === 'settled' && A.won === false);

// ── 규칙 B: 승리 leg + 연기 leg(킥오프 3일 전 = 48h~6일 창 안) → void 제외, 남은 leg로 지급 ──
const LEGS_VOID = [
  { gid: 'G_WIN', sel: 'A ML', am: 100, kt: iso(-3 * D) },     // +100 → dec 2.0, won
  { gid: 'G_GONE', sel: 'B ML', am: 158, kt: iso(-3 * D) } ];  // 결과 부재, 연기 확정
const B = settleNew(LEGS_VOID, { G_WIN: { g: 'won' } }, grade, now);
ok('GREEN 규칙B: 연기 leg void → 남은 승리 leg만 지급 (mult 2.0)', B.state === 'settled' && B.won === true && Math.abs(B.mult - 2.0) < 1e-9);
ok('void는 절대 패배로 계산 안 됨', B.legR.includes('void') && !B.legR.includes('lost'));

// ── 전부 void → 환불(mult 1.0 = stake 반환) ──
const C = settleNew([{ gid: 'G_GONE', sel: 'B ML', am: 158, kt: iso(-3 * D) }], {}, grade, now);
ok('전 leg void → 스테이크 환불 (won, mult 1.0)', C.state === 'settled' && C.won === true && C.mult === 1);

// ── fail-safe: void는 함부로 못 쏜다 ──
ok('킥오프 20h 전(48h 미만) → 계속 보류(open)',
   settleNew([{ gid: 'G_GONE', sel: 'B ML', am: 158, kt: iso(-20 * H) }], {}, grade, now).state === 'open');
ok('킥오프 8일 전(6일 증명창 밖) → 계속 보류(open) — 결과가 창 밖일 수 있음',
   settleNew([{ gid: 'G_GONE', sel: 'B ML', am: 158, kt: iso(-8 * D) }], {}, grade, now).state === 'open');
ok('kt 없음(파싱 불가) → 계속 보류(open)',
   settleNew([{ gid: 'G_GONE', sel: 'B ML', am: 158 }], {}, grade, now).state === 'open');

// ── 회귀: 정상 케이스 불변 ──
const LEGS_OK = [ { gid: 'G1', sel: 'A ML', am: 100, kt: iso(-D) }, { gid: 'G2', sel: 'B ML', am: -110, kt: iso(-D) } ];
const D2 = settleNew(LEGS_OK, { G1: { g: 'won' }, G2: { g: 'won' } }, grade, now);
ok('회귀: 전승 팔레이 → won, mult 2.0×1.909', D2.state === 'settled' && D2.won === true && Math.abs(D2.mult - 2 * (1 + 100 / 110)) < 1e-9);
ok('회귀: 미래 경기 포함 + 패배 없음 → 보류(open)',
   settleNew([{ gid: 'GF', sel: 'A ML', am: 100, kt: iso(+D) }], {}, grade, now).state === 'open');
ok('회귀: push leg는 곱셈 제외(환불성) — won+push → mult 2.0',
   Math.abs(settleNew(LEGS_OK, { G1: { g: 'won' }, G2: { g: 'push' } }, grade, now).mult - 2.0) < 1e-9);

console.log(pass ? '🟢 settle-void-earlylost — all green' : '🔴 settle-void-earlylost FAILED');
process.exit(pass ? 0 : 1);
