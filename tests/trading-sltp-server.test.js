// Alpexa — trading.html(모바일 앱) SL/TP 서버 저장·집행 게이트 (정적 핀, 네트워크 0, 돈 0)
//
// 계약 (2026-07-22 "고고" — 모바일 SL/TP 반쪽 해소):
//  ① SL/TP 저장 = rpc(fx_modify) — 폰 메모리 전용 금지 (새로고침 증발·앱 꺼지면 미집행이던 구멍)
//  ② 표시 진실 = 서버 positions.meta (pullPos가 meta를 읽어 adopt/reconcile, 6s 낙관 유예)
//  ③ 클라 SL/TP 자동청산 판정 0건 — 집행은 서버 fx_sltp 단독 (워터마크+레벨가+원자 선점)
//  ④ 시장가 주문의 SL/TP는 fx_open 성공 직후 결정적 부착 (웹트레이드·터미널과 동일 패턴)
//  ⑤ 거절 시 낙관 반영 원복 + 사유 토스트 (유령 SL/TP 금지)
//  ⑥ 서버 자동청산 알림 = positions Realtime status='closed' (+이 기기발 청산 중복 방지 __fxClosing)
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('trading SL/TP server — 모바일 서버 저장·집행 게이트');

const src = fs.readFileSync(path.join(REPO, 'trading.html'), 'utf8');

// ① 저장 = fx_modify RPC
ok('① fxModifyReal = rpc(fx_modify, {p_local_id, p_sl, p_tp})',
   /rpc\('fx_modify',\{ p_local_id:String\(id\),[\s\S]{0,120}p_sl:[\s\S]{0,80}p_tp:/.test(src));
ok('① modifyPosition → fxModifyReal 호출 (로컬 전용 setState 금지)',
   /function modifyPosition\(updated\)\{[\s\S]{0,600}fxModifyReal\(updated\.id, updated\.sl, updated\.tp/.test(src));

// ② 표시 진실 = positions.meta
ok('② pullPos가 meta 선택 + meta.sl/tp adopt', /'local_id,symbol,side,size,open_price,pnl,status,meta'/.test(src) &&
   /sl:metaSl\(p\), tp:metaTp\(p\)/.test(src));
ok('② 기존 행 reconcile (서버 meta 합류) + 6s 낙관 유예(slTpTs)',
   /o\.slTpTs && \(now-o\.slTpTs\)<6000/.test(src) && /nsl===o\.sl&&ntp===o\.tp/.test(src));

// ③ 클라 판정 제거
ok('③ 클라 SL/TP 자동청산 판정 0건 (sltpHits 흔적 0)', !/sltpHits/.test(src));
ok('③ TP/SL 교차식 잔재 0 (cur>=o.tp / cur<=o.sl 류)',
   !/cur>=o\.tp/.test(src) && !/cur<=o\.sl/.test(src));

// ④ 시장가 SL/TP 결정적 부착
ok('④ fx_open 성공 → fxModifyReal(orderData.sl/tp) 즉시 부착',
   /finalize\(\+d\.open\);[\s\S]{0,300}fxModifyReal\(id, orderData\.sl, orderData\.tp/.test(src));

// ⑤ 거절 원복
ok('⑤ 수정 거절 → 원복(old.sl/tp) + SL/TP rejected 토스트',
   /sl:old\.sl,tp:old\.tp/.test(src) && /SL\/TP rejected/.test(src));

// ⑥ 서버 자동청산 알림
ok('⑥ positions Realtime closed → 토스트/알림 (Server SL/TP)',
   /n\.status==='closed'/.test(src) && /Server SL\/TP/.test(src));
ok('⑥ 이 기기발 청산 중복 방지 (__fxClosing 20s)',
   /__fxClosing/.test(src) && /Date\.now\(\)-mine<20000/.test(src));

console.log((fail ? '🔴' : '🟢') + ' trading-sltp-server — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
