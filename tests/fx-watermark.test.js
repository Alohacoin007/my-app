// Alpexa — 스파이크 워터마크 v1 게이트 (판정·정산 미러 + 소스핀, 네트워크 0, 돈 0)
//
// 계약 (FX-스파이크-워터마크-설계.md):
//  ① 워터마크 없음(null) → 판정·정산 기존과 자구 동일 (폴백 불변)
//  ② mid는 안 넘었는데 창의 lo/hi가 SL/TP를 스침 → 발동 + "레벨 가격" 정산 + detail '~WM'
//  ③ mid 자체가 넘음 → 기존대로 시장가(mid∓half) 정산 (기존 핀 보존)
//  ④ 펌프: fx-stream은 스킵 프레임 고저 누적→기록 후 리셋 · crypto는 hi=lo=mid
//  ⑤ 스왑 포함·원자 선점은 그대로 (fx-settle-swap-pin이 별도 감시)
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx watermark — 스파이크 판정·레벨 정산 게이트');

// ── 소스핀 ──
const sltp = fs.readFileSync(path.join(REPO, 'supabase/sql/fx_modify.sql'), 'utf8');
const stop = fs.readFileSync(path.join(REPO, 'supabase/sql/fx_stopout.sql'), 'utf8');
const fxs = fs.readFileSync(path.join(REPO, 'supabase/functions/fx-stream/index.ts'), 'utf8');
const cps = fs.readFileSync(path.join(REPO, 'supabase/functions/crypto-prices/index.ts'), 'utf8');
ok('prices에 tick_hi/tick_lo 추가 (재실행 안전)', /add column if not exists tick_hi/.test(sltp) && /add column if not exists tick_lo/.test(sltp));
ok('fx_sltp: coalesce(tick_lo, mid)/coalesce(tick_hi, mid) 판정 (null=현행 동일)',
   /coalesce\(tick_lo, mid\), coalesce\(tick_hi, mid\)/.test(sltp));
ok('fx_sltp: 워터마크 히트 → 레벨가 오버라이드 + ~WM 감사 표기',
   /case when v_wm then v_lvl else null end/.test(sltp) && /'~WM'/.test(sltp));
ok('fx_realized_pnl: p_close_override(default null) + 구 4-인자 drop(모호성 방지)',
   /p_close_override numeric default null/.test(stop) && /drop function if exists public\.fx_realized_pnl\(text, text, numeric, numeric\)/.test(stop));
ok('fx_realized_pnl: 오버라이드 시 v_close 대체', /if p_close_override is not null and p_close_override > 0 then v_close := p_close_override/.test(stop));
ok('fx-stream: 스킵 프레임 고저 누적 + 기록 후 리셋', /wmHi\[sym\] = wmHi\[sym\] == null \? midRaw : Math\.max/.test(fxs) && /delete wmHi\[sym\]; delete wmLo\[sym\]/.test(fxs));
ok('crypto-price: tick_hi=tick_lo=mid (판정 현행 동일)', /tick_hi: m, tick_lo: m/.test(cps));

// ── 판정·정산 미러 (fx_sltp v2와 자구 동일 의미) ──
const judge = (side, sl, tp, mid, lo, hi) => {
  lo = lo == null ? mid : lo; hi = hi == null ? mid : hi;
  let hit = null, lvl = null, wm = false;
  if (side === 'BUY') {
    if (sl != null && lo <= sl) { hit = 'SL'; lvl = sl; wm = mid > sl; }
    else if (tp != null && hi >= tp) { hit = 'TP'; lvl = tp; wm = mid < tp; }
  } else {
    if (sl != null && hi >= sl) { hit = 'SL'; lvl = sl; wm = mid < sl; }
    else if (tp != null && lo <= tp) { hit = 'TP'; lvl = tp; wm = mid > tp; }
  }
  return { hit, closeAt: hit ? (wm ? 'LEVEL:' + lvl : 'MID') : null, wm };
};
// ① 폴백 불변: lo/hi null → 기존(mid) 판정과 동일
let r = judge('BUY', 1.14, null, 1.145, null, null);
ok('① null 워터마크 + mid 미교차 → 미발동 (현행 동일)', r.hit === null);
r = judge('BUY', 1.14, null, 1.139, null, null);
ok('① null 워터마크 + mid 교차 → 발동·시장가 정산 (현행 동일)', r.hit === 'SL' && r.closeAt === 'MID');
// ② 스침: mid는 위인데 창 lo가 SL 아래 → 발동 + 레벨 정산
r = judge('BUY', 1.14, null, 1.1405, 1.1398, 1.1407);
ok('② BUY 스침(lo<sl<mid) → SL 발동 + 레벨(1.14) 정산 + WM', r.hit === 'SL' && r.closeAt === 'LEVEL:1.14' && r.wm === true);
r = judge('BUY', null, 1.15, 1.1495, 1.149, 1.1502);
ok('② BUY TP 스침(hi>tp>mid) → TP 발동 + 레벨 정산', r.hit === 'TP' && r.closeAt === 'LEVEL:1.15' && r.wm === true);
r = judge('SELL', 1.15, null, 1.1495, 1.149, 1.1502);
ok('② SELL SL 스침(hi>sl>mid) → SL 발동 + 레벨 정산', r.hit === 'SL' && r.closeAt === 'LEVEL:1.15' && r.wm === true);
// ③ mid 교차 → 시장가 정산 유지
r = judge('BUY', 1.14, null, 1.1395, 1.139, 1.1405);
ok('③ mid 교차 → 시장가(MID) 정산 유지', r.hit === 'SL' && r.closeAt === 'MID' && r.wm === false);
// 스침 반대 방향은 미발동 (BUY SL인데 hi만 위로 스침 등)
r = judge('BUY', 1.14, null, 1.145, 1.142, 1.148);
ok('교차 없는 창 → 미발동 (고저가 SL에 안 닿음)', r.hit === null);

console.log((fail ? '🔴' : '🟢') + ' fx-watermark — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
