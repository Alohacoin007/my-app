#!/usr/bin/env node
// Alpexa — PC 웹트레이드: 거래 내역 CSV 내보내기 (2026-11-17 앱 분석 4단계 #5, 사장님 "4단계 진행해")
// ============================================================================
// 불변식: 내보낸 파일 = **선택한 기간의 서버 기록 전체**. 화면에 올라온 줄만 내보내지 않는다.
//   (History 탭은 스크롤한 만큼만 불러온다 — 처음 50건, 내려가면 20건씩. 화면 것만 내보내면 고객은
//    "전체 내역"이라고 믿는 파일에서 옛 거래가 빠진다 = 세금·정산 자료로 쓰면 사고.)
// 돈: 0. 본인 계좌의 settlements 를 **읽기만** 한다 (SELECT · RLS). RPC·insert·update 없음.
// 행위 테스트는 webtrade.html 의 실제 소스(_mapSettle · exportHistory · histCsv)를 뽑아 Node 에서 돌린다 (네트워크 0).
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grab = (re) => { const m = src.match(re); return m ? m[0] : ''; };

const map_src = grab(/_mapSettle\(x\)\{[\s\S]*?\n {6}close_time:ct[^\n]*\},/);
const exp_src = grab(/async exportHistory\(fromMs,toMs\)\{[\s\S]*?\n {2}\},/);
const csv_src = grab(/function histCsv\(rows\)\{[\s\S]*?\n\}/);
ok('소스 블록(_mapSettle · exportHistory · histCsv)을 찾았다', !!(map_src && exp_src && csv_src), JSON.stringify({ map: !!map_src, exp: !!exp_src, csv: !!csv_src }));

// ── 정적 ─────────────────────────────────────────────────────────────────────
ok('History 줄에 Export CSV 버튼이 있다', /className="hb hbexp"[^>]*onClick=\{exportCsv\}/.test(src));
ok('버튼은 서버에서 다시 읽는다 (positionsStore.exportHistory) — 화면 줄(histShown)로 파일을 만들지 않는다',
   /const exportCsv=async\(\)=>\{[\s\S]{0,600}positionsStore\.exportHistory\(/.test(src) && !/histCsv\(histShown\)/.test(src));
ok('읽기 전용: exportHistory 안에 rpc · insert · update · upsert · delete 없음',
   !!exp_src && !/\.(rpc|insert|update|upsert|delete)\(/.test(exp_src));
ok('본인 FX 계좌의 청산 기록만 읽는다 (server=fx · acct_no=로그인 계좌 · kind=fx_close)',
   !!exp_src && /\.eq\('server','fx'\)\.eq\('acct_no',acct\)\.eq\('kind','fx_close'\)/.test(exp_src));

// ── 행위 ─────────────────────────────────────────────────────────────────────
(async () => {
  if (map_src && exp_src && csv_src) {
    // 가짜 서버: N건 · created_at 내림차순 · range/gte/lte 를 실제처럼 처리 · 호출 기록
    const mkDb = (all, opt = {}) => { const calls = [];
      return { calls, from(tbl) { const st = { eqs: {}, lo: null, hi: null, orders: [] };
        const q = { select() { return q; }, eq(k, v) { st.eqs[k] = v; return q; },
        gte(k, v) { st.lo = v; return q; }, lte(k, v) { st.hi = v; return q; },
        order(k) { st.orders.push(k); return q; },
        range(a, b) { calls.push({ tbl, eqs: st.eqs, gte: st.lo, lte: st.hi, orders: st.orders, a, b });
          if (opt.failAt != null && calls.length === opt.failAt) return Promise.resolve({ data: null, error: { message: 'boom' } });
          let rows = all.filter((r) => (!st.lo || r.created_at >= st.lo) && (!st.hi || r.created_at <= st.hi));
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null }); } };
        return q; } }; };
    const mkRows = (n) => Array.from({ length: n }, (_, i) => ({ local_id: 'fx-' + String(100000 + i), symbol: i % 2 ? 'EURUSD' : 'BTCUSD', stake: 0.1,
      pnl: i % 3 ? 12.5 : -7.25, detail: (i % 2 ? 'BUY' : 'SELL') + ' 0.1 @ 1.14318 -> 1.14400',
      created_at: new Date(Date.UTC(2026, 10, 16, 0, 0, 0) - i * 60000).toISOString() }));
    const mk = (db, me = true, acct = 'FX-1', demo = false) => new Function('AlpexaSync', 'WT_DEMO', 'window',
      'const store={\n' + map_src + '\n' + exp_src + '\n};\n' + csv_src + '\nreturn { store, histCsv };'
    )({ db, me: me ? { email: 't@t' } : null, acctFor: () => acct }, demo, { AlpexaSync: { db, me: me ? {} : null } });

    // A. 1,234건 — 화면엔 50건만 올라와 있어도 전부 나온다 (쪽 나눠 끝까지)
    const all = mkRows(1234); const dbA = mkDb(all); const A = mk(dbA);
    const ra = await A.store.exportHistory(null, null);
    ok('A. 1,234건 전부 내보낸다 (쪽 단위로 끝까지 읽음)', ra.ok === true && ra.rows.length === 1234 && ra.complete === true, JSON.stringify({ ok: ra.ok, n: ra.rows && ra.rows.length }));
    ok('A. 중복·누락 0 · 최신순', ra.ok && new Set(ra.rows.map((r) => r.local_id)).size === 1234 && ra.rows[0].local_id === 'fx-100000' && ra.rows[1233].local_id === 'fx-101233');
    ok('A. 쪽 크기 ≤ 1000 (Supabase 한 번 응답 상한 이내) · 쪽마다 같은 정렬(created_at → local_id)',
       dbA.calls.length >= 2 && dbA.calls.every((c) => c.b - c.a + 1 <= 1000 && c.orders[0] === 'created_at' && c.orders[1] === 'local_id'));
    ok('A. 서버 필터 = server fx · 로그인 계좌 · fx_close', dbA.calls.every((c) => c.tbl === 'settlements' && c.eqs.server === 'fx' && c.eqs.acct_no === 'FX-1' && c.eqs.kind === 'fx_close'));

    // B. 기간 — 서버에 기간을 넘긴다 (브라우저에서 걸러 내지 않는다)
    const from = Date.UTC(2026, 10, 15, 23, 0, 0), to = Date.UTC(2026, 10, 15, 23, 59, 59);
    const dbB = mkDb(all); const rb = await mk(dbB).store.exportHistory(from, to);
    const expect = all.filter((r) => r.created_at >= new Date(from).toISOString() && r.created_at <= new Date(to).toISOString()).length;
    ok('B. 기간 필터가 서버 질의에 들어간다 (gte · lte) · 그 기간 것만', rb.ok && rb.rows.length === expect && expect > 0 && dbB.calls[0].gte === new Date(from).toISOString() && dbB.calls[0].lte === new Date(to).toISOString(),
       JSON.stringify({ got: rb.rows && rb.rows.length, expect }));

    // C. 실패는 실패로 — 반쪽짜리 파일을 주지 않는다
    const rc = await mk(mkDb(all, { failAt: 2 })).store.exportHistory(null, null);
    ok('C. 중간 쪽에서 읽기 실패 → ok:false (앞쪽만 담긴 파일을 만들지 않는다)', rc.ok === false && !rc.rows);
    const rd = await mk(mkDb(all), false).store.exportHistory(null, null);
    ok('C. 로그아웃 상태 → ok:false (not_logged_in)', rd.ok === false && rd.reason === 'not_logged_in');
    const re = await mk(mkDb(all), true, 'FX-1', true).store.exportHistory(null, null);
    ok('C. 데모 화면 → ok:false (가짜 내역을 파일로 내보내지 않는다)', re.ok === false);
    const rf = await mk(mkDb([])).store.exportHistory(null, null);
    ok('C. 거래 0건 → ok:true · rows 0', rf.ok === true && rf.rows.length === 0);

    // D. CSV 모양
    const csv = A.histCsv(ra.rows.slice(0, 3));
    const lines = csv.split('\r\n');
    ok('D. 머리줄 = Ticket,Symbol,Type,Volume,Open Price,Close Price,Close Time (UTC),Profit (USD)',
       lines[0] === 'Ticket,Symbol,Type,Volume,Open Price,Close Price,Close Time (UTC),Profit (USD)');
    ok('D. 줄 수 = 머리줄 + 거래 수 (끝은 줄바꿈)', lines.length === 5 && lines[4] === '');
    ok('D. 값: fx-100000,BTCUSD,SELL,0.10,1.14318,1.144,2026-11-16 00:00:00,-7.25', lines[1] === 'fx-100000,BTCUSD,SELL,0.10,1.14318,1.144,2026-11-16 00:00:00,-7.25', lines[1]);
    ok('D. 음수 손익은 숫자 그대로 (엑셀에서 합계가 된다)', /,-7\.25$/.test(lines[1]) && /,12\.50$/.test(lines[2]));
    const evil = A.histCsv([{ local_id: '=HYPERLINK("http://x","a")', symbol: 'EUR,USD', side: 'BUY', volume: 1, open_price: 1, close_price: 2, close_ms: Date.UTC(2026, 0, 1), profit: 1 },
                            { local_id: 'x', symbol: '@SUM(A1)', side: '—', volume: 1, open_price: 1, close_price: 2, close_ms: 0, profit: 0 }]).split('\r\n');
    ok('D. 수식으로 시작하는 값은 무력화(앞에 \') · 쉼표·따옴표는 감싼다', evil[1].startsWith('"\'=HYPERLINK(""http://x"",""a"")"') && /,"EUR,USD",/.test(evil[1]) && /,'@SUM\(A1\),/.test(evil[2]), evil[1] + ' | ' + evil[2]);
    ok('D. 방향을 모르는 줄(—)은 빈 칸 · 시각이 없으면 빈 칸', /,'@SUM\(A1\),,1\.00,1,2,,0\.00$/.test(evil[2]), evil[2]);
  }
  console.log(`\n${fail ? '🔴' : '🟢'} webtrade-history-export — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
