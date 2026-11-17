#!/usr/bin/env node
// Alpexa — 크립토 모바일: 지정가·스탑 주문 화면 = 서버 대기주문 (2026-11-17 사장님 "크립토 지정가 진행해")
// ============================================================================
// 서버 쪽 증명은 tests/crypto-pending-sql.test.js (SQL 실제 실행). 이 파일은 **앱이 그 서버 경로만 쓰는지**를 고정한다.
// 불변식:
//   ① 주문은 폰에 저장하지 않는다 — localStorage 'alpexa.pendingOrders' 쓰기 0 (옛 값은 지우기만).
//      (2026-11-15 에 숨긴 이유: 폰에만 저장되고 아무도 체결하지 않았다.)
//   ② 접수 = crypto_place_pending · 취소 = crypto_cancel_pending · 목록 = crypto_pending 읽기(본인 계좌 · pending). 테이블 직접 쓰기 0.
//   ③ 지정가·스탑 탭은 **서버에 기능이 깔려 있을 때만** 보인다 (SQL 배포 전엔 시장가만 = 지금과 같음).
//   ④ 접수 결과를 기다린다 — 서버가 거절했는데 "접수됨" 화면을 보여주지 않는다.
//   ⑤ 주문 번호는 주문 화면을 열 때 한 번 만든다 → 더블탭·재시도가 같은 번호(서버 duplicate).
//   ⑥ BUY 는 달러 · SELL 은 코인 수량으로 보낸다 (서버 계약과 같음).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const jsx = rd('src/crypto-live-app.jsx'), bin = rd('vendor/crypto-live-compiled.js'), sql = rd('supabase/sql/crypto_pending.sql');
const grabFn = (src, name) => { const m = src.match(new RegExp('function ' + name + '\\(')); if (!m) return '';
  const i = m.index; let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

for (const [nm, s] of [['소스', jsx], ['컴파일본', bin]]) {
  ok(`${nm} ①: 'alpexa.pendingOrders' 를 폰에 저장하지 않는다 (지우기만)`,
     !/usePersistedState\(\s*['"]alpexa\.pendingOrders['"]/.test(s) && !/setItem\(\s*['"]alpexa\.pendingOrders['"]/.test(s) && /removeItem\(\s*['"]alpexa\.pendingOrders['"]\s*\)/.test(s));
  ok(`${nm} ②: 접수 = crypto_place_pending 1곳 · 취소 = crypto_cancel_pending 1곳`,
     (s.match(/\.rpc\(\s*['"]crypto_place_pending['"]/g) || []).length === 1 && (s.match(/\.rpc\(\s*['"]crypto_cancel_pending['"]/g) || []).length === 1);
  ok(`${nm} ②: 목록은 crypto_pending 을 읽기만 한다 (본인 계좌 · pending) — insert/update/upsert/delete 0`,
     /from\(\s*['"]crypto_pending['"]\s*\)\s*\.select\(/.test(s) && /\.eq\(\s*['"]acct_no['"],\s*acct\s*\)\s*\.eq\(\s*['"]status['"],\s*['"]pending['"]\s*\)/.test(s) &&
     !/from\(\s*['"]crypto_pending['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(s));
  ok(`${nm} ③: 주문 유형은 서버 기능 표시(window.__alpexaCryptoPending)가 있을 때만 Limit·Stop 포함`,
     /window\.__alpexaCryptoPending\s*\?\s*\[\s*['"]Market['"],\s*['"]Limit['"],\s*['"]Stop['"]\s*\]\s*:\s*\[\s*['"]Market['"]\s*\]/.test(s));
  ok(`${nm} ③: 목록 읽기가 실패하면(미배포·권한 없음) 기능을 끈다`, /window\.__alpexaCryptoPending\s*=\s*false/.test(s) && /window\.__alpexaCryptoPending\s*=\s*true/.test(s));
}
ok('소스 ④: 지정가·스탑도 결과를 기다리고, 실패면 알리고 멈춘다 ("Order not placed")',
   /res = cb \? await cb\(assetId, usdAmount, \{[\s\S]{0,200}id: pendIdRef\.current/.test(jsx) && /alert\('Order not placed: '/.test(jsx));
ok('소스 ⑤: 주문 번호는 화면당 한 번 (useRef) — 누를 때마다 새로 만들지 않는다',
   /const pendIdRef = React\.useRef\(null\);/.test(jsx) && /if \(!pendIdRef\.current\) pendIdRef\.current = cryptoPendingId\(\);/.test(jsx));
ok('소스 ⑥: BUY 는 p_usd · SELL 은 p_qty 만 보낸다',
   /p_usd: o\.side === 'buy' \? [^,]+ : null,\s*p_qty: o\.side === 'sell' \? [^,}]+ : null/.test(jsx));
ok('소스: 옛 "폰 대기열에 넣기"(setPendingOrders((p) => [...p, {…}])) 코드가 없다', !/setPendingOrders\(\(p\) => \[\s*\.\.\.p,/.test(jsx));
ok('소스: 홈의 Open Orders 가 매도 주문을 "Buy" 로 표시하지 않는다 (방향 표시)', /\{o\.side === 'sell' \? 'Sell' : 'Buy'\} \{name\}/.test(jsx));

// 순수 함수: 번호 형식 = 서버가 받는 형식 · 서버 행 → 화면 모양
const idFn = grabFn(jsx, 'cryptoPendingId'), rowFn = grabFn(jsx, 'cryptoPendingRow');
ok('순수 함수(cryptoPendingId · cryptoPendingRow)를 찾았다', !!(idFn && rowFn));
if (idFn && rowFn) {
  const { cryptoPendingId, cryptoPendingRow } = new Function(idFn + '\n' + rowFn + '\nreturn { cryptoPendingId, cryptoPendingRow };')();
  const serverRe = new RegExp((sql.match(/p_id !~ '([^']+)'/) || [])[1] || 'x^');
  const ids = Array.from({ length: 500 }, () => cryptoPendingId());
  ok('주문 번호 500개 전부 서버 형식(' + serverRe.source + ')에 맞고 서로 다르다', ids.every((i) => serverRe.test(i)) && new Set(ids).size === 500, ids[0]);
  const b = cryptoPendingRow({ id: 'cp-a', asset: 'BTC', side: 'buy', otype: 'limit', usd: '250', qty: null, trigger: '95000', created_at: '2026-11-17T01:00:00Z' });
  const s2 = cryptoPendingRow({ id: 'cp-b', asset: 'ETH', side: 'sell', otype: 'stop', usd: null, qty: '0.5', trigger: '3800', created_at: '2026-11-17T01:00:00Z' });
  ok('서버 행 → 화면: BUY limit $250 @95000', b.id === 'cp-a' && b.sym === 'BTC' && b.side === 'buy' && b.type === 'Limit' && b.usd === 250 && b.coin === null && b.trigger === 95000);
  ok('서버 행 → 화면: SELL stop 0.5 ETH @3800', s2.side === 'sell' && s2.type === 'Stop' && s2.usd === null && s2.coin === 0.5 && s2.trigger === 3800);
}
console.log(`\n${fail ? '🔴' : '🟢'} crypto-pending-client — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
