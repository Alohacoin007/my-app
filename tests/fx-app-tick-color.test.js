// Alpexa — fx-app 시세 방향 색 게이트 (2026-10-03 사장님 "시세가 내려가면 빨강 올라가면 파랑", 표시 전용·돈 0)
//
// 계약 (MT5 Market Watch 와 같은 규칙):
//  ① 색 토큰: 상승 = 파랑(--up #0A6CFF) · 하락 = 빨강(--down #FF3B30), 라이트·다크 둘 다
//  ② 가격 칸 색 = 마지막 움직임 방향. 오르면 파랑(tu) · 내리면 빨강(td) · 그대로면 직전 색 유지 · 처음 가격은 기본 글자색
//     ②b (2026-10-03 사장님 "비드 에스크 따로") BID 칸은 BID 의 움직임, ASK 칸은 ASK 의 움직임 — 스프레드만 벌어지면 BID 빨강·ASK 파랑
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
ok('④ SELL 칸 = tickCls(…,\'b\') · BUY 칸 = tickCls(…,\'a\') (홈·주문 각 2) · 상세 = tickCls(sym)',
   (src.match(/btn sell'\+tickCls\([^)]*,'b'\)/g) || []).length === 2 && (src.match(/btn buy'\+tickCls\([^)]*,'a'\)/g) || []).length === 2 && /class="px'\+tickCls\(sym\)/.test(src));

// ② 판정 로직 (setFeed + tickCls 를 그대로 뽑아 실행)
{
  const grab = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };
  const code = grab('setFeed') + '\n' + grab('tickCls');
  // 테스트용 BID/ASK: mid ∓ spr×0.00005 (앱의 halfOf 와 같은 모양 — 스프레드가 벌어지면 BID 는 내려가고 ASK 는 올라간다)
  const S = { feed: {} };
  const midOf = (s) => (S.feed[s] && S.feed[s].mid > 0) ? S.feed[s].mid : 0;
  const bidOf = (s) => midOf(s) ? midOf(s) - S.feed[s].spr * 0.00005 : 0, askOf = (s) => midOf(s) ? midOf(s) + S.feed[s].spr * 0.00005 : 0;
  let f = null;
  try { f = new Function('S', 'bidOf', 'askOf', 'digitsOf', code + '\nreturn {setFeed, tickCls};')(S, bidOf, askOf, () => 5); } catch (e) {}
  ok('② setFeed/tickCls 추출', !!f);
  if (f) {
    const t = (sym) => [f.tickCls(sym, 'b'), f.tickCls(sym, 'a'), f.tickCls(sym)].join('|');
    f.setFeed('EURUSD', 1.10000, 1, 1); const first = t('EURUSD');
    f.setFeed('EURUSD', 1.10020, 1, 2); const up = t('EURUSD');
    f.setFeed('EURUSD', 1.10020, 1, 3); const same = t('EURUSD');
    f.setFeed('EURUSD', 1.09990, 1, 4); const dn = t('EURUSD');
    f.setFeed('EURUSD', 1.09990, 3, 5); const widen = t('EURUSD');
    f.setFeed('EURUSD', 1.09990, 1, 6); const narrow = t('EURUSD');
    f.setFeed('EURUSD', 1.09990, 1.000001, 7); const dust = t('EURUSD');
    f.setFeed('EURUSD', 0, 1, 8);      const zero = t('EURUSD');
    ok('② 처음 가격 = 기본색 (BID·ASK·mid 모두)', first === '||', first);
    ok('② mid 가 오르면 BID·ASK·mid 모두 파랑', up === ' tu| tu| tu', up);
    ok('② 그대로면 직전 색 유지', same === ' tu| tu| tu', same);
    ok('② mid 가 내리면 모두 빨강', dn === ' td| td| td', dn);
    ok('②b 스프레드만 벌어지면 BID 빨강 · ASK 파랑 · mid 유지', widen === ' td| tu| td', widen);
    ok('②b 스프레드만 좁혀지면 BID 파랑 · ASK 빨강', narrow === ' tu| td| td', narrow);
    ok('②b 화면 자릿수 아래 미세 변화는 색을 바꾸지 않는다', dust === narrow, dust);
    ok('② 가격 0(피드 없음)은 방향을 만들지 않는다', zero === narrow, zero);
    ok('② 모르는 종목 = 기본색', t('XXX') === '||');
  }
}
// CSS
ok('CSS: .tu = var(--up), .td = var(--down) (가격 칸·상세 시세)',
   /\.btn\.tu[^{]*\{[^}]*color:\s*var\(--up\)/.test(src) && /\.btn\.td[^{]*\{[^}]*color:\s*var\(--down\)/.test(src) &&
   /\.det \.px\.tu[^{]*\{[^}]*var\(--up\)/.test(src) && /\.det \.px\.td[^{]*\{[^}]*var\(--down\)/.test(src));

// ⑤ (2026-10-25 사장님 "셀 박스랑 바이 박스가 빨강·파랑으로 고정 — 가격이 움직일 때마다 박스 색도") 박스 테두리도 시세 방향 색.
//    SELL/BUY 라는 쪽 색으로 고정하지 않는다: 오르면 파랑 · 내리면 빨강 · 첫 틱 전엔 중립. 1-Click 홈 행 · 주문 화면 하단 둘 다.
//    실브라우저로 fx-app.html 의 실제 <style> 을 계산해 본다 (선택자 우선순위·!important 함정까지 잡힌다). 네트워크 0 (setContent).
(async () => {
  let chromium = null, exe = null;
  try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
  try { const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const p = path.join(base, d, c); if (!exe && fs.existsSync(p)) exe = p; } } catch (_) {}
  if (!chromium || !exe) { console.log('  ⏭️  ⑤ 브라우저 없음 — 박스 색 행위 검사 생략'); return done(); }
  const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.route(() => true, (r) => r.abort());
  for (const theme of ['light', 'dark']) {
    await page.setContent(`<html data-theme="${theme}"><head><style>${css}</style></head><body>
      <div class="app oc-on"><div class="half"><div id="hs" class="btn sell">1</div><div id="hb" class="btn buy">1</div></div>
        <div class="half"><div id="hsu" class="btn sell tu">1</div><div id="hbd" class="btn buy td">1</div></div>
        <div class="half"><div id="hsd" class="btn sell td">1</div><div id="hbu" class="btn buy tu">1</div></div>
        <div class="foot"><div class="half"><div id="fsu" class="btn sell tu">1</div><div id="fbd" class="btn buy td">1</div><div id="fs" class="btn sell">1</div></div></div></div>
    </body></html>`);
    const bc = await page.evaluate(() => Object.fromEntries(['hs', 'hb', 'hsu', 'hbd', 'hsd', 'hbu', 'fsu', 'fbd', 'fs']
      .map((id) => [id, getComputedStyle(document.getElementById(id)).borderTopColor])));
    const UP = 'rgb(10, 108, 255)', DN = 'rgb(255, 59, 48)';
    ok(`⑤ [${theme}] 1-Click 홈: SELL 칸이 오르면 파랑 테두리 · BUY 칸이 내리면 빨강 테두리`, bc.hsu === UP && bc.hbd === DN, JSON.stringify(bc));
    ok(`⑤ [${theme}] 1-Click 홈: SELL 내리면 빨강 · BUY 오르면 파랑`, bc.hsd === DN && bc.hbu === UP, JSON.stringify(bc));
    ok(`⑤ [${theme}] 주문 화면 하단: SELL 오르면 파랑 · BUY 내리면 빨강 (!important 덮음)`, bc.fsu === UP && bc.fbd === DN, JSON.stringify(bc));
    ok(`⑤ [${theme}] 첫 틱 전 = 중립 테두리 (쪽 색 고정 아님)`, ![UP, DN].includes(bc.hs) && ![UP, DN].includes(bc.hb) && ![UP, DN].includes(bc.fs), JSON.stringify(bc));
  }
  await browser.close();
  done();
})();
