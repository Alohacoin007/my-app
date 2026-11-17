#!/usr/bin/env node
// Alpexa — PC 웹트레이드: 전체 청산 · 부분 청산 (2026-11-17 앱 분석 4단계 #3, 표·불변식 승인: 사장님 "FX 거래 관리 진행해")
// ============================================================================
// 불변식: **앱은 새 돈 경로를 만들지 않는다.** 청산은 전부 이미 배포된 서버 경로로만 한다.
//   · 전체 청산  = 포지션마다 fx_close 한 번 (기존 closeOrder 그대로). 한 번에 하나씩 차례로.
//                  같은 포지션을 한 실행에서 두 번 부르지 않고, 두 번 불러도 서버가 ALREADY_CLOSED 로 거절한다(행 잠금).
//   · 부분 청산  = fx_close_partial(p_local_id, p_size, p_ref). p_ref 는 **창을 열 때 한 번** 만든다 →
//                  더블클릭·응답 유실 후 재시도가 같은 번호로 가서 서버가 duplicate(돈 0)로 답한다 = 두 번째 조각이 닫힐 수 없다.
//   · 손익·잔여 수량·잔고는 전부 서버가 계산한다. 앱은 positions/settlements/accounts 에 쓰지 않는다.
// 행위 테스트는 webtrade.html 의 실제 소스(closeAllRun · partialVol)를 뽑아 Node 에서 돌린다 (네트워크 0).
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grabFn = (name) => { const m = src.match(new RegExp('(async )?function ' + name + '\\(')); if (!m) return '';
  const i = m.index; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

// ── 정적: 돈 경로 ─────────────────────────────────────────────────────────────
const rpcs = [...new Set((src.match(/\.rpc\('([a-z_]+)'/g) || []).map((s) => s.slice(6, -1)))].sort();
const ALLOWED = ['fx_cancel_pending', 'fx_close', 'fx_close_partial', 'fx_modify', 'fx_open', 'fx_place_pending', 'pamm_investor_report', 'pamm_join', 'pamm_leave'];
ok('웹트레이드가 부르는 서버 경로 = 승인된 9개뿐 (새 경로 0)', JSON.stringify(rpcs) === JSON.stringify(ALLOWED), rpcs.join(','));
ok('앱이 돈 테이블에 직접 쓰지 않는다 (positions · settlements · accounts · ledger insert/update/upsert/delete 0)',
   !/from\('(positions|settlements|accounts|ledger|fx_pending)'\)\s*\.(insert|update|upsert|delete)\(/.test(src));
ok('fx_close 를 부르는 곳은 closeOrder 한 곳 (전체 청산도 그 함수를 쓴다)', (src.match(/\.rpc\('fx_close',/g) || []).length === 1);
ok('fx_close_partial 을 부르는 곳도 한 곳 · 인자 = p_local_id · p_size · p_ref',
   (src.match(/\.rpc\('fx_close_partial',/g) || []).length === 1 && /\.rpc\('fx_close_partial',\{ p_local_id:p\.local_id, p_size:v, p_ref:pref\.current \}\)/.test(src));
ok('부분 청산 번호(p_ref)는 창을 열 때 한 번 만든다 (useRef) — 누를 때마다 새로 만들지 않는다',
   /const pref=React\.useRef\('wt-pc-'\+Date\.now\(\)\.toString\(36\)\+'-'\+Math\.random\(\)\.toString\(36\)\.slice\(2,8\)\);/.test(src));

// ── 정적: 화면 ───────────────────────────────────────────────────────────────
ok('Trade 탭 잔고줄에 Close All 버튼 (포지션이 있을 때만 · 진행 중엔 잠김)',
   /\{pos\.length>0 && <button className="closeall" disabled=\{closingAll\} onClick=\{closeAll\}/.test(src));
ok('Close All 은 누르기 전에 확인을 받는다 (confirm) — 한 번 잘못 눌러 전부 닫히지 않게', /const closeAll=async\(\)=>\{[\s\S]{0,400}window\.confirm\(/.test(src));
ok('Close All 은 closeAllRun + 기존 eng.closeOrder 로 닫는다', /closeAllRun\(list, \{[\s\S]{0,300}eng\.closeOrder\(p\.local_id\)/.test(src));
ok('수정 창에 부분 청산 구역 (실제 포지션 · 0.02 랏 이상일 때만)', /className="mpos-part"/.test(src) && /const canPart=!p\._demo && lots>=0\.02-1e-9;/.test(src));
ok('수량 칸을 더블클릭해도 수정 창이 열린다 (부분 청산 진입)', /<td className="sltp" onDoubleClick=\{\(\)=>setModifyP\(p\)\} title="[^"]*">\{lotsOf\(p\)\.toFixed\(2\)\}<\/td>/.test(src));
ok('장 마감 종목은 부분 청산 버튼이 잠긴다 (진짜 관문은 서버)', /disabled=\{pbusy\|\|v==null\|\|!marketOpen\(symbol\)\}/.test(src));

// ── 행위 ─────────────────────────────────────────────────────────────────────
const run_src = grabFn('closeAllRun'), vol_src = grabFn('partialVol');
ok('소스 블록(closeAllRun · partialVol)을 찾았다', !!(run_src && vol_src), JSON.stringify({ run: !!run_src, vol: !!vol_src }));
(async () => {
  if (run_src && vol_src) {
    const { closeAllRun, partialVol } = new Function(run_src + '\n' + vol_src + '\nreturn { closeAllRun, partialVol };')();
    const P = (id, sym) => ({ local_id: id, symbol: sym });

    // A. 전부 닫힌다 · 한 번에 하나씩 · 한 포지션에 한 번
    { const calls = []; let live = 0, maxLive = 0;
      const r = await closeAllRun([P('a', 'EURUSD'), P('b', 'BTCUSD'), P('c', 'XAUUSD')], { isOpen: () => true,
        closeOne: async (p) => { calls.push(p.local_id); live++; maxLive = Math.max(maxLive, live); await new Promise((z) => setTimeout(z, 5)); live--; return { ok: true, pnl: 10 }; } });
      ok('A. 3건 → 3건 닫힘 · 실패 0 · 건너뜀 0 · 손익 합 30', r.closed === 3 && r.failed.length === 0 && r.skipped.length === 0 && r.pnl === 30, JSON.stringify(r));
      ok('A. 포지션마다 정확히 한 번 호출', calls.join(',') === 'a,b,c');
      ok('A. 한 번에 하나씩 (동시에 두 건을 보내지 않는다)', maxLive === 1, 'max ' + maxLive); }

    // B. 같은 포지션이 목록에 두 번 있어도 한 번만 부른다 (화면 갱신이 겹친 경우)
    { const calls = [];
      const r = await closeAllRun([P('a', 'EURUSD'), P('a', 'EURUSD'), P('b', 'BTCUSD')], { isOpen: () => true, closeOne: async (p) => { calls.push(p.local_id); return { ok: true, pnl: 1 }; } });
      ok('B. 중복 포지션 → 호출 2번 (a 한 번 · b 한 번)', calls.join(',') === 'a,b' && r.closed === 2, calls.join(',')); }

    // C. 장 마감 종목은 건너뛴다 (서버로 보내지 않는다) · 나머지는 닫는다
    { const calls = [];
      const r = await closeAllRun([P('a', 'EURUSD'), P('b', 'BTCUSD'), P('c', 'AAPL')], { isOpen: (s) => s === 'BTCUSD', closeOne: async (p) => { calls.push(p.local_id); return { ok: true, pnl: 5 }; } });
      ok('C. 주말: FX·주식은 건너뛰고 크립토만 닫는다', calls.join(',') === 'b' && r.closed === 1 && r.skipped.join(',') === 'EURUSD,AAPL', JSON.stringify(r)); }

    // D. 한 건이 실패해도 멈추지 않는다 · 실패는 이유와 함께 남긴다 · 실패를 성공으로 세지 않는다
    { const calls = []; const closed = [];
      const r = await closeAllRun([P('a', 'EURUSD'), P('b', 'BTCUSD'), P('c', 'XAUUSD'), P('d', 'GBPUSD')], { isOpen: () => true,
        closeOne: async (p) => { calls.push(p.local_id); if (p.local_id === 'b') return { ok: false, reason: 'position not found or already closed' }; if (p.local_id === 'c') throw new Error('network'); return { ok: true, pnl: -2.5 }; },
        onClosed: (p) => closed.push(p.local_id) });
      ok('D. 4건 중 2건 실패 → 닫힘 2 · 실패 2 (이유 포함) · 끝까지 시도', r.closed === 2 && calls.join(',') === 'a,b,c,d' &&
         r.failed.length === 2 && r.failed[0].symbol === 'BTCUSD' && /already closed/.test(r.failed[0].reason) && /network/.test(r.failed[1].reason), JSON.stringify(r));
      ok('D. 닫힌 것만 화면 기록 콜백을 받는다 (실패한 포지션을 닫힌 것처럼 그리지 않는다)', closed.join(',') === 'a,d');
      ok('D. 손익 합은 닫힌 것만 (-5.00)', Math.abs(r.pnl - (-5)) < 1e-9); }

    // E. 빈 목록
    { const r = await closeAllRun([], { isOpen: () => true, closeOne: async () => ({ ok: true }) });
      ok('E. 포지션 0건 → 아무것도 안 한다', r.closed === 0 && r.failed.length === 0 && r.skipped.length === 0); }

    // F. 부분 청산 수량 검증 — 서버 규칙(0.01 단위 · 0 < 수량 < 전량 · 잔여 ≥ 0.01)과 같은 범위만 통과
    const T = (inp, lots) => partialVol(inp, lots);
    ok('F. 0.50 랏 포지션: 0.01 · 0.25 · 0.49 통과', T('0.01', 0.5) === 0.01 && T('0.25', 0.5) === 0.25 && T('0.49', 0.5) === 0.49);
    ok('F. 전량(0.50)·전량 초과(0.6)는 거절 — 전량은 ✕ 청산을 쓴다', T('0.50', 0.5) === null && T('0.6', 0.5) === null);
    ok('F. 0 · 음수 · 빈칸 · 글자는 거절', T('0', 0.5) === null && T('-0.1', 0.5) === null && T('', 0.5) === null && T('abc', 0.5) === null && T(null, 0.5) === null);
    ok('F. 0.01 단위가 아닌 값(0.005 · 0.123)은 거절 (반올림해서 보내지 않는다)', T('0.005', 0.5) === null && T('0.123', 0.5) === null);
    ok('F. 지수·쉼표·공백 섞인 값은 거절 (1e-2 · 0,1 · "0.1 0")', T('1e-2', 0.5) === null && T('0,1', 0.5) === null && T('0.1 0', 0.5) === null);
    ok('F. 앞뒤 공백은 허용 · "1" · ".5" 같은 표기도 숫자로 읽는다', T(' 0.10 ', 0.5) === 0.1 && T('1', 2) === 1 && T('.5', 1) === 0.5);
    ok('F. 0.01 랏 포지션은 부분 청산 불가 (잔여 0.01 미만)', T('0.01', 0.01) === null);
    ok('F. 0.02 랏 포지션: 0.01 만 통과', T('0.01', 0.02) === 0.01 && T('0.02', 0.02) === null);
    ok('F. 부동소수 경계: 0.30 랏에서 0.29 통과 · 0.3 거절', T('0.29', 0.3) === 0.29 && T('0.3', 0.3) === null);
  }
  console.log(`\n${fail ? '🔴' : '🟢'} webtrade-trade-mgmt — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
