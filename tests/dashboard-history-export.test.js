#!/usr/bin/env node
// Alpexa — PC 대시보드 2종: 내역 CSV 내보내기 (2026-11-17 앱 분석 4단계 #5, 사장님 "4단계 진행해")
//   · 크립토 대시보드 Activity 위젯 → 매매·스테이킹·입출금 내역
//   · 스포츠 대시보드 My bets → Settled (정산된 베팅)
// ============================================================================
// 불변식: 내보낸 파일 = 선택한 범위의 **서버 기록 전체**. 화면 목록(크립토 최근 200/100/100건 · 스포츠 최근 50건)으로
//         파일을 만들지 않는다. 한 쪽이라도 못 읽으면 파일을 만들지 않는다 (반쪽짜리 내역 금지).
// 돈: 0. SELECT 만 (RLS 본인 것). rpc · insert · update · upsert · delete 없음.
// 행위 테스트는 두 html 의 실제 함수 소스를 뽑아 Node 에서 가짜 서버로 돌린다 (네트워크 0).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grabFn = (src, name) => { const m = src.match(new RegExp('(async )?function ' + name + '\\(')); if (!m) return '';
  const i = m.index; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

// 가짜 서버: 테이블별 행 · created_at 내림차순으로 이미 정렬돼 있다고 가정 · eq/in/gte 를 실제처럼 처리 · 호출 기록
const mkDb = (tables, opt = {}) => { const calls = [];
  return { calls, from(tbl) { const st = { eqs: {}, ins: {}, lo: null, orders: [] };
    const q = { select() { return q; }, eq(k, v) { st.eqs[k] = v; return q; }, in(k, v) { st.ins[k] = v; return q; },
      gte(k, v) { st.lo = v; return q; }, order(k) { st.orders.push(k); return q; }, limit() { return q; },
      range(a, b) { calls.push({ tbl, eqs: st.eqs, ins: st.ins, gte: st.lo, orders: st.orders, a, b });
        if (opt.failTbl === tbl && (opt.failPage == null || a >= opt.failPage)) return Promise.resolve({ data: null, error: { message: 'boom' } });
        let rows = (tables[tbl] || []).filter((r) => Object.keys(st.eqs).every((k) => r[k] === undefined || r[k] === st.eqs[k]) &&
          Object.keys(st.ins).every((k) => st.ins[k].includes(r[k])) && (!st.lo || r.created_at >= st.lo));
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null }); } };
    return q; } }; };
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

(async () => {
  // ════ 크립토 대시보드 ════
  {
    const src = rd('crypto-dashboard.html');
    const fns = ['csvCell', 'csvTime', 'readAllPages', 'acExportRows', 'acCsv'].map((n) => grabFn(src, n));
    ok('크립토: 함수 5개(csvCell · csvTime · readAllPages · acExportRows · acCsv)를 찾았다', fns.every(Boolean), fns.map(Boolean).join(','));
    ok('크립토: Activity 줄에 CSV 버튼(#acCsv)이 있다', /id="acCsv"/.test(src) && /getElementById\('acCsv'\)\.addEventListener\('click'/.test(src));
    ok('크립토: 버튼은 서버에서 다시 읽는다 (acExportRows) — 화면 목록(ac.rows)으로 파일을 만들지 않는다',
       /acExportRows\(sess, ?ac\.days, ?ac\.filt\)/.test(src) && !/acCsv\(ac\.rows\)/.test(src));
    const ex = grabFn(src, 'acExportRows') + grabFn(src, 'readAllPages');
    ok('크립토: 읽기 전용 (rpc · insert · update · upsert · delete 없음)', !!ex && !/\.(rpc|insert|update|upsert|delete)\(/.test(ex));
    if (fns.every(Boolean)) {
      const trades = Array.from({ length: 1203 }, (_, i) => ({ ref: 'cb-' + (900000 - i), acct_no: 'CR-1', asset: i % 2 ? 'ETH' : 'BTC', side: i % 3 ? 'buy' : 'sell',
        usd: 100 + i, qty: 0.001 * (i + 1), price: 95000, fee: 0.25, created_at: iso(T0 - i * 3600e3) }));
      const reqs = [{ local_id: 'R-1', type: 'Deposit', amount: 500, status: 'approved', server: 'crypto', from_label: 'Bank', to_label: 'Crypto', created_at: iso(T0 - 5 * 3600e3) },
                    { local_id: 'R-2', type: 'Withdraw', amount: 200, status: 'pending', server: 'crypto', from_label: 'Crypto', to_label: 'Bank', created_at: iso(T0 - 6 * 3600e3) },
                    { local_id: 'R-3', type: 'Deposit', amount: 999, status: 'approved', server: 'fx', from_label: 'Bank', to_label: 'FX', created_at: iso(T0 - 7 * 3600e3) },
                    { local_id: 'R-4', type: 'Bonus', amount: 5, status: 'approved', server: 'crypto', created_at: iso(T0 - 8 * 3600e3) }];
      const acts = [{ kind: 'reward', symbol: 'ALPXS', amount: 1.5, detail: 'Staking reward', cust_id: 'C1', server: 'crypto', created_at: iso(T0 - 9 * 3600e3) },
                    { kind: 'send', symbol: 'USDT', amount: 25, detail: 'To C2', cust_id: 'C1', server: 'crypto', created_at: iso(T0 - 10 * 3600e3) }];
      const AC_META = { buy: 1, sell: 1, swap: 1, stake: 1, unstake: 1, deposit: 1, withdraw: 1, transfer: 1, reward: 1, send: 1 };
      const mk = (db) => new Function('AlpexaSync', 'AC_META', fns.join('\n') + '\nreturn { acExportRows, acCsv, csvCell };')({ db }, AC_META);
      const sess = { acct: 'CR-1', me: { custId: 'C1' } };

      const dbA = mkDb({ crypto_trades: trades, requests: reqs, activity: acts }); const A = mk(dbA);
      const all = await A.acExportRows(sess, 0, 'All');
      ok('크립토 A. 전 기간·All: 매매 1,203 + 입출금 2(크립토 것만 · 화면이 아는 종류만) + 리워드·송금 2 = 1,207줄', all.length === 1207, String(all.length));
      ok('크립토 A. 최신순 · 매매 중복 0', all.every((r, i) => !i || all[i - 1].ts >= r.ts) && new Set(all.filter((r) => r.ref.startsWith('cb-')).map((r) => r.ref)).size === 1203);
      ok('크립토 A. 쪽 크기 ≤ 1000 · 매매는 본인 계좌(acct_no)로만 읽는다',
         dbA.calls.every((c) => c.b - c.a + 1 <= 1000) && dbA.calls.filter((c) => c.tbl === 'crypto_trades').every((c) => c.eqs.acct_no === 'CR-1') && dbA.calls.filter((c) => c.tbl === 'crypto_trades').length >= 3);
      const tr = await mk(mkDb({ crypto_trades: trades, requests: reqs, activity: acts })).acExportRows(sess, 0, 'Trades');
      const stk = await mk(mkDb({ crypto_trades: trades, requests: reqs, activity: acts })).acExportRows(sess, 0, 'Staking');
      const fun = await mk(mkDb({ crypto_trades: trades, requests: reqs, activity: acts })).acExportRows(sess, 0, 'Funding');
      ok('크립토 B. 종류 필터가 화면과 같다 (Trades 1,203 · Staking 1 · Funding 3)', tr.length === 1203 && stk.length === 1 && fun.length === 3, [tr.length, stk.length, fun.length].join('/'));
      const realNow = Date.now; Date.now = () => T0;
      const dbC = mkDb({ crypto_trades: trades, requests: reqs, activity: acts });
      const d7 = await mk(dbC).acExportRows(sess, 7, 'Trades');
      Date.now = realNow;
      ok('크립토 B. 기간(7일)을 서버 질의로 넘긴다 (gte) · 7일치만 (169건)', d7.length === 169 && dbC.calls.every((c) => c.gte === iso(T0 - 7 * 86400e3)), String(d7.length));
      let threw = false; try { await mk(mkDb({ crypto_trades: trades, requests: reqs, activity: acts }, { failTbl: 'crypto_trades', failPage: 500 })).acExportRows(sess, 0, 'All'); } catch (e) { threw = true; }
      ok('크립토 C. 매매 둘째 쪽에서 읽기 실패 → 예외 (앞쪽만 담긴 파일을 만들지 않는다)', threw);
      threw = false; try { await mk(mkDb({ crypto_trades: trades, requests: reqs, activity: acts }, { failTbl: 'requests' })).acExportRows(sess, 0, 'All'); } catch (e) { threw = true; }
      ok('크립토 C. 입출금 읽기 실패 → 예외 (매매만 담긴 파일을 "전체"인 척 주지 않는다)', threw);
      const csv = A.acCsv(all.slice(0, 2).concat(all.filter((r) => !r.ref.startsWith('cb-')))).split('\r\n');
      ok('크립토 D. 머리줄', csv[0] === 'Time (UTC),Type,Asset,Quantity,Price (USD),Amount (USD),Fee (USD),Status,Detail,Reference', csv[0]);
      ok('크립토 D. 매매 줄: 시각·종류·코인·수량·가격·금액·수수료·참조번호', csv[1] === '2026-11-16 12:00:00,sell,BTC,0.001,95000,100.00,0.25,,,cb-900000', csv[1]);
      ok('크립토 D. 입출금 줄: 상태·경로 포함', csv.some((l) => l === '2026-11-16 06:00:00,withdraw,,,,200.00,,pending,Crypto → Bank,R-2'), csv.slice(3).join(' | '));
      ok('크립토 D. 수식 주입 무력화 · 쉼표는 감싼다', A.csvCell('=1+1') === "'=1+1" && A.csvCell('a,b') === '"a,b"' && A.csvCell('-12.5') === '-12.5' && A.csvCell('@x') === "'@x");
    }
  }

  // ════ 스포츠 대시보드 ════
  {
    const src = rd('sports-dashboard.html');
    const fns = ['csvCell', 'csvTime', 'readAllPages', 'mbExportRows', 'mbCsv'].map((n) => grabFn(src, n));
    ok('스포츠: 함수 5개(csvCell · csvTime · readAllPages · mbExportRows · mbCsv)를 찾았다', fns.every(Boolean), fns.map(Boolean).join(','));
    ok('스포츠: Settled 목록에 Export CSV 버튼(#mbCsvBtn)이 있다', /id="mbCsvBtn"/.test(src));
    ok('스포츠: 버튼은 서버에서 다시 읽는다 (mbExportRows) — 화면 목록(ms.settled · 최근 50건)으로 파일을 만들지 않는다',
       /mbExportRows\(m\.custId\)/.test(src) && !/mbCsv\(ms\.settled\)/.test(src) && !/mbCsv\(sb\)/.test(src));
    const ex = grabFn(src, 'mbExportRows') + grabFn(src, 'readAllPages');
    ok('스포츠: 읽기 전용 (rpc · insert · update · upsert · delete 없음)', !!ex && !/\.(rpc|insert|update|upsert|delete)\(/.test(ex));
    if (fns.every(Boolean)) {
      const legs = (r) => JSON.stringify({ legs: [{ pk: 'Lakers -3.5', gm: 'Lakers @ Celtics', am: -110, lg: 'NBA', r }, { pk: 'Over 221.5', gm: 'Lakers @ Celtics', am: -105, lg: 'NBA', r: 'won' }] });
      const rows = Array.from({ length: 640 }, (_, i) => ({ local_id: 'bet-' + (5000 - i), ticket: 'T' + (5000 - i), symbol: 'Parlay · 2', stake: 10, cust_id: 'C1', server: 'sports',
        pnl: i % 2 ? 26.4 : -10, kind: i % 2 ? 'bet_won' : 'bet_lost', detail: legs(i % 2 ? 'won' : 'lost'), created_at: iso(T0 - i * 3600e3) }));
      rows.push({ local_id: 'x-1', ticket: '', symbol: 'Cash out', stake: 10, cust_id: 'C1', server: 'sports', pnl: 2, kind: 'cash_out', detail: '', created_at: iso(T0 - 700 * 3600e3) });
      rows.push({ local_id: 'bet-push', ticket: 'TP', symbol: 'Single', stake: 20, cust_id: 'C1', server: 'sports', pnl: 0, kind: 'bet_won', detail: 'not json', created_at: iso(T0 - 701 * 3600e3) });
      const mk = (db) => new Function('AlpexaSync', fns.join('\n') + '\nreturn { mbExportRows, mbCsv };')({ db });
      const dbA = mkDb({ settlements: rows }); const A = mk(dbA);
      const out = await A.mbExportRows('C1');
      ok('스포츠 A. 정산된 베팅 641건 전부 (화면은 최근 50건) — won/lost 만, 다른 종류(cash_out)는 화면처럼 제외', out.length === 641, String(out.length));
      ok('스포츠 A. 최신순 · 중복 0 · 본인(cust_id)·sports 로만 읽는다 · 쪽 ≤ 1000',
         out[0].id === 'bet-5000' && new Set(out.map((r) => r.id)).size === 641 && dbA.calls.every((c) => c.eqs.cust_id === 'C1' && c.eqs.server === 'sports' && c.b - c.a + 1 <= 1000) && dbA.calls.length >= 2);
      let threw = false; try { await mk(mkDb({ settlements: rows }, { failTbl: 'settlements', failPage: 500 })).mbExportRows('C1'); } catch (e) { threw = true; }
      ok('스포츠 C. 둘째 쪽에서 읽기 실패 → 예외 (반쪽짜리 파일 금지)', threw);
      const csv = A.mbCsv([out[0], out[1], out[640]]).split('\r\n');
      ok('스포츠 D. 머리줄', csv[0] === 'Settled (UTC),Ticket,Type,Legs,Selections,Stake (USD),Result,Payout (USD),Net (USD)', csv[0]);
      ok('스포츠 D. 진 베팅: 지급 0 · 순손익 -10', csv[1] === '2026-11-16 12:00:00,T5000,Parlay · 2,2,Lakers -3.5 (-110) [lost] | Over 221.5 (-105) [won],10.00,lost,0.00,-10.00', csv[1]);
      ok('스포츠 D. 이긴 베팅: 지급 = 건 돈 + 수익 · 순손익 +26.40', /,10\.00,won,36\.40,26\.40$/.test(csv[2]), csv[2]);
      ok('스포츠 D. 수익 0으로 이긴 줄 = refunded (화면 표기와 같음) · 지급 = 건 돈 · 순손익 0 · 깨진 detail 도 줄은 나온다', /^[^,]+,TP,Single,0,,20\.00,refunded,20\.00,0\.00$/.test(csv[3]), csv[3]);
    }
  }
  console.log(`\n${fail ? '🔴' : '🟢'} dashboard-history-export — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
