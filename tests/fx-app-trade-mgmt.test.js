#!/usr/bin/env node
// Alpexa — 모바일 FX(fx-app.html): 전체 청산 · 랏 직접 입력 (2026-11-17 앱 분석 4단계 #3, 승인: 사장님 "FX 거래 관리 진행해")
// ============================================================================
// 불변식: **앱은 새 돈 경로를 만들지 않는다.**
//   · 전체 청산 = 포지션마다 기존 fx_close 를 한 번씩, 차례로 (서버가 행 잠금으로 "한 포지션 = 한 번 청산"을 보장).
//                 누르기 전에 확인 화면을 거친다. 실패한 포지션은 숨기지 않고 알린다.
//   · 랏 직접 입력 = 화면의 수량(S.lots)을 바꿀 뿐이다. 주문은 지금처럼 fx_open(서버 증거금 관문). 0.01 단위만 받고
//                    반올림해서 받지 않는다 — 고객이 친 숫자와 나가는 주문 수량이 같아야 한다.
// 허용 서버 경로 목록(RPC_ALLOW)은 tests/trading-rh.test.js 가 지킨다 — 이 변경으로 늘지 않는다.
// 행위 테스트는 fx-app.html 의 실제 소스(closeAllRun · lotVal)를 뽑아 Node 에서 돌린다 (네트워크 0).
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fx-app.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grabFn = (name) => { const m = src.match(new RegExp('(async )?function ' + name + '\\(')); if (!m) return '';
  const i = m.index; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

const run_src = grabFn('closeAllRun'), lot_src = grabFn('lotVal'), do_src = grabFn('doCloseAll');
ok('소스 블록(closeAllRun · lotVal · doCloseAll)을 찾았다', !!(run_src && lot_src && do_src), JSON.stringify({ run: !!run_src, lot: !!lot_src, do: !!do_src }));

// ── 정적: 돈 경로 ─────────────────────────────────────────────────────────────
const allow = ((src.match(/var RPC_ALLOW=\{([^}]*)\}/) || [])[1] || '').split(',').map((x) => x.split(':')[0].trim()).filter(Boolean);
ok('허용 서버 경로 수 = 11 그대로 (새 경로 0)', allow.length === 11, String(allow.length));
ok('전체 청산은 기존 fx_close 만 부른다 (잠금 closeall · 포지션 id 그대로)',
   !!do_src && /lock\('closeall'\)/.test(do_src) && /rpc\('fx_close',\{ p_local_id:p\.id \}\)/.test(do_src) &&
   (do_src.match(/rpc\('/g) || []).length === 1);
ok('fx_close 를 부르는 곳 = 2곳 (한 건 청산 doClose · 전체 청산 doCloseAll)', (src.match(/rpc\('fx_close',/g) || []).length === 2);
ok('앱이 돈 테이블에 직접 쓰지 않는다', !/from\('(positions|settlements|accounts|ledger|fx_pending)'\)\s*\.(insert|update|upsert|delete)\(/.test(src));

// ── 정적: 화면 ───────────────────────────────────────────────────────────────
ok('Positions 탭: 포지션 2개 이상일 때만 "Close all" 이 보인다 → 확인 화면(sheet:closeall)으로',
   /S\.positions\.length>=2 \?[^\n]{0,200}data-act="sheet:closeall"/.test(src));
ok('확인 화면 안의 버튼만 실제 청산을 시작한다 (data-act="closeall" 은 시트 안 1곳)',
   (src.match(/data-act="closeall"/g) || []).length === 1 && /S\.sheet==='closeall'/.test(src) && /else if\(k==='closeall'\)\{ doCloseAll\(\); return; \}/.test(src));
ok('수량 숫자를 누르면 입력 화면이 열린다 (홈 1-Click 줄 · 주문 화면 2곳)', (src.match(/<span data-act="sheet:lots">/g) || []).length === 2);
ok('입력 화면: 숫자 칸(#lotIn · 소수 키패드) + Set 버튼(lotset)', /id="lotIn" type="text" inputmode="decimal"/.test(src) && /data-act="lotset"/.test(src));
ok('Set 은 lotVal 을 통과한 값만 S.lots 에 넣는다 — 틀린 값이면 수량을 안 바꾸고 알린다',
   /else if\(k==='lotset'\)\{ var li=document\.getElementById\('lotIn'\), lv=lotVal\(li\?li\.value:''\);\s*if\(lv==null\)\{ toast\('[^']+'\); return; \}\s*S\.lots=lv; S\.sheet=null; \}/.test(src));

// ── 행위 ─────────────────────────────────────────────────────────────────────
(async () => {
  if (run_src && lot_src) {
    const { closeAllRun, lotVal } = new Function(run_src + '\n' + lot_src + '\nreturn { closeAllRun, lotVal };')();
    const P = (id, sym) => ({ id, sym });
    { const calls = []; let live = 0, maxLive = 0;
      const r = await closeAllRun([P('a', 'EURUSD'), P('b', 'BTCUSD'), P('c', 'XAUUSD')], async (p) => { calls.push(p.id); live++; maxLive = Math.max(maxLive, live); await new Promise((z) => setTimeout(z, 5)); live--; return { ok: true, pnl: 10 }; });
      ok('A. 3건 → 3건 닫힘 · 손익 합 30 · 포지션마다 한 번 · 한 번에 하나씩', r.closed === 3 && r.pnl === 30 && r.failed.length === 0 && calls.join(',') === 'a,b,c' && maxLive === 1, JSON.stringify(r)); }
    { const calls = [];
      const r = await closeAllRun([P('a', 'EURUSD'), P('a', 'EURUSD'), P('b', 'BTCUSD')], async (p) => { calls.push(p.id); return { ok: true, pnl: 1 }; });
      ok('B. 목록에 같은 포지션이 두 번 있어도 한 번만 부른다', calls.join(',') === 'a,b' && r.closed === 2); }
    { const calls = [];
      const r = await closeAllRun([P('a', 'EURUSD'), P('b', 'AAPL'), P('c', 'XAUUSD'), P('d', 'GBPUSD')], async (p) => { calls.push(p.id);
        if (p.id === 'b') return { ok: false, error: 'market closed', symbol: 'AAPL' }; if (p.id === 'c') throw new Error('connection issue'); return { ok: true, pnl: -2.5 }; });
      ok('C. 실패(장 마감 · 통신)해도 끝까지 간다 · 닫힘 2 · 실패 2(종목·이유) · 손익은 닫힌 것만 -5.00',
         calls.join(',') === 'a,b,c,d' && r.closed === 2 && r.failed.length === 2 && r.failed[0].sym === 'AAPL' && /market closed/.test(r.failed[0].why.error) &&
         r.failed[1].sym === 'XAUUSD' && /connection/.test(r.failed[1].why.error) && Math.abs(r.pnl + 5) < 1e-9, JSON.stringify(r)); }
    { const r = await closeAllRun([], async () => ({ ok: true })); ok('D. 0건 → 아무것도 안 한다', r.closed === 0 && r.failed.length === 0); }

    ok('E. 랏: 0.01 · 0.1 · 1 · 2.50 · 100 통과', lotVal('0.01') === 0.01 && lotVal('0.1') === 0.1 && lotVal('1') === 1 && lotVal('2.50') === 2.5 && lotVal('100') === 100);
    ok('E. 랏: 0 · 음수 · 빈칸 · 글자 거절', lotVal('0') === null && lotVal('-1') === null && lotVal('') === null && lotVal('abc') === null && lotVal(null) === null);
    ok('E. 랏: 0.01 단위가 아니면 거절 (0.005 · 1.234) — 반올림해서 받지 않는다', lotVal('0.005') === null && lotVal('1.234') === null);
    ok('E. 랏: 쉼표·지수·공백 섞인 값 거절 ("1,5" · "1e2" · "1 0")', lotVal('1,5') === null && lotVal('1e2') === null && lotVal('1 0') === null);
    ok('E. 랏: 상한 100 초과 거절 (100.01 · 1000) — 오타로 큰 주문이 나가지 않게', lotVal('100.01') === null && lotVal('1000') === null);
    ok('E. 랏: 앞뒤 공백 · ".5" 표기 허용', lotVal(' 0.30 ') === 0.3 && lotVal('.5') === 0.5);
  }
  console.log(`\n${fail ? '🔴' : '🟢'} fx-app-trade-mgmt — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
