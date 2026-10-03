// Alpexa — fx-app 시세 방향 색 게이트 (2026-10-03 사장님 "시세가 내려가면 빨강 올라가면 파랑", 표시 전용·돈 0)
//
// 계약 (MT5 Market Watch 와 같은 규칙):
//  ① 색 토큰: 상승 = 파랑(--up #0A6CFF) · 하락 = 빨강(--down #FF3B30), 라이트·다크 둘 다
//  ② 가격 칸 색 = 마지막 움직임 방향. 오르면 파랑(tu) · 내리면 빨강(td) · 그대로면 직전 색 유지 · 처음 가격은 기본 글자색
//  ③ 가격이 들어오는 두 길(폴링 applyFeedRows · 실시간 채널)이 같은 함수(setFeed) 하나를 지난다 — 한쪽만 방향을 잃지 않게
//  ④ 홈 행 SELL/BUY · 주문 화면 SELL/BUY · 상세 큰 시세가 같은 방향 색을 쓴다
// playwright/Chromium 없으면 정적 핀만.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
const done = () => { console.log((fail ? '🔴' : '🟢') + ' fx-app-tick-color — ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0); };
console.log('fx-app tick color — 상승 파랑 · 하락 빨강');

const src = fs.readFileSync(path.join(REPO, 'fx-app.html'), 'utf8');
// ① 토큰
ok('① 라이트·다크 둘 다 --up: #0A6CFF', (src.match(/--up: #0A6CFF;/g) || []).length === 2);
ok('① 라이트·다크 둘 다 --down: #FF3B30', (src.match(/--down: #FF3B30;/g) || []).length === 2);
// ③ 단일 진입점
ok('③ S.feed 를 쓰는 곳은 setFeed 하나뿐', (src.match(/S\.feed\[[^\]]+\]\s*=/g) || []).length === 1 && /function setFeed\(/.test(src));
ok('③ 폴링·실시간 둘 다 setFeed 경유', /applyFeedRows[\s\S]{0,200}setFeed\(/.test(src) && /rh-prices[\s\S]{0,200}setFeed\(/.test(src));
// ④ 템플릿
ok('④ 홈·주문 SELL/BUY 와 상세 시세가 tickCls 를 쓴다', (src.match(/tickCls\(/g) || []).length >= 4);

// ② 판정 로직 (setFeed + tickCls 를 그대로 뽑아 실행)
{
  const grab = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };
  const code = grab('setFeed') + '\n' + grab('tickCls');
  let f = null;
  try { f = new Function('S', code + '\nreturn {setFeed, tickCls};')({ feed: {} }); } catch (e) {}
  ok('② setFeed/tickCls 추출', !!f);
  if (f) {
    f.setFeed('EURUSD', 1.1000, 1, 1); const first = f.tickCls('EURUSD');
    f.setFeed('EURUSD', 1.1002, 1, 2); const up = f.tickCls('EURUSD');
    f.setFeed('EURUSD', 1.1002, 1, 3); const same = f.tickCls('EURUSD');
    f.setFeed('EURUSD', 1.0999, 1, 4); const dn = f.tickCls('EURUSD');
    f.setFeed('EURUSD', 0, 1, 5);      const zero = f.tickCls('EURUSD');
    ok('② 처음 가격 = 기본색(빈 클래스)', first === '', JSON.stringify(first));
    ok('② 오르면 tu(파랑)', up === ' tu', JSON.stringify(up));
    ok('② 그대로면 직전 색 유지', same === ' tu', JSON.stringify(same));
    ok('② 내리면 td(빨강)', dn === ' td', JSON.stringify(dn));
    ok('② 가격 0(피드 없음)은 방향을 만들지 않는다', zero === ' td', JSON.stringify(zero));
    ok('② 모르는 종목 = 기본색', f.tickCls('XXX') === '');
  }
}
// CSS
ok('CSS: .tu = var(--up), .td = var(--down) (가격 칸·상세 시세)',
   /\.btn\.tu[^{]*\{[^}]*color:\s*var\(--up\)/.test(src) && /\.btn\.td[^{]*\{[^}]*color:\s*var\(--down\)/.test(src) &&
   /\.det \.px\.tu[^{]*\{[^}]*var\(--up\)/.test(src) && /\.det \.px\.td[^{]*\{[^}]*var\(--down\)/.test(src));
done();
