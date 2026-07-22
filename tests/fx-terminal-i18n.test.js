// Alpexa — FX 터미널 다국어(i18n) 행위 게이트 (헤드리스, 네트워크 0, 돈 0)
//
// 계약 (webtrade I18N 이식, 2026-07-22):
//  ① 기본 en — 원문 그대로 (키=영문, 미번역 폴백=영문)
//  ② setLang('ko'|'ja'|'zh') → 시세창 하위탭·툴박스 탭·계좌 바·MW 컬럼·☰ 메뉴·주문창이 즉시 번역
//  ③ 선택은 localStorage 'alpexa.dash.lang'에 저장 (크립토/스포츠 대시보드와 공유 키)
//  ④ en 복귀 시 원문 복원 (잔상 없음)
// playwright/Chromium 없으면 SKIP(exit 0).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter(x => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c); if (fs.existsSync(f)) return f;
      }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
if (!chromium || !exe) { console.log('⏭️  SKIP fx-terminal-i18n (no playwright/chromium)'); process.exit(0); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
const serve = port => new Promise(res => {
  const s = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(REPO, p);
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
    rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp));
  });
  s.listen(port, () => res(s));
});
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

(async () => {
  const PORT = 8893, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  console.log('fx-terminal i18n — 다국어 행위 게이트');
  const page = await browser.newPage({ viewport: { width: 1900, height: 904 } });
  await page.goto(`http://localhost:${PORT}/dev/fx-terminal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // ① 기본 en
  const en = await page.evaluate(() => ({
    lang: LANG.cur,
    sub: document.querySelector('#mwSub [data-sub="Symbols"]').textContent,
    tab: document.querySelector('#tbxTabs [data-tab="Trade"]').textContent,
    acct: (document.querySelector('#tbxBody .acctline') || {}).textContent || '',
  }));
  ok('① 기본 en — Symbols/Trade/Balance 원문', en.lang === 'en' && en.sub === 'Symbols' && en.tab === 'Trade' && /Balance:/.test(en.acct), JSON.stringify(en));

  // ② ko 전환 — 하위탭·툴박스 탭·계좌 바·MW 헤더·☰ 메뉴 즉시 번역
  const ko = await page.evaluate(() => { setLang('ko');
    return {
      sub: document.querySelector('#mwSub [data-sub="Symbols"]').textContent,
      tab: document.querySelector('#tbxTabs [data-tab="Trade"]').textContent,
      acct: (document.querySelector('#tbxBody .acctline') || {}).textContent || '',
      mwhd: (document.querySelector('#mwHead') || {}).textContent || '',
      menu: (document.getElementById('menuDrop') || {}).innerHTML || '',
      saved: localStorage.getItem('alpexa.dash.lang'),
      dock: document.querySelector('.dockvlabel').textContent,
    }; });
  ok('② ko: 시세창 하위탭 Symbols→심볼', ko.sub === '심볼', ko.sub);
  ok('② ko: 툴박스 탭 Trade→거래', ko.tab === '거래', ko.tab);
  ok('② ko: 계좌 바 잔고/순자산/여유 마진', /잔고:/.test(ko.acct) && /순자산:/.test(ko.acct) && /여유 마진:/.test(ko.acct), ko.acct.slice(0, 80));
  ok('② ko: MW 컬럼 헤더 심볼/매도/매수', /심볼/.test(ko.mwhd) && /매도/.test(ko.mwhd) && /매수/.test(ko.mwhd), ko.mwhd);
  ok('② ko: ☰ 메뉴 캔들 차트/창 바둑판 정렬/전체 화면', /캔들 차트/.test(ko.menu) && /창 바둑판 정렬/.test(ko.menu) && /전체 화면/.test(ko.menu));
  ok('③ 저장 = alpexa.dash.lang (대시보드 공유 키)', ko.saved === 'ko', ko.saved);
  ok('② ko: Toolbox 세로 라벨 → 툴박스', ko.dock === '툴박스', ko.dock);

  // ② 주문창 라벨 (ko 상태에서 열기)
  const ord = await page.evaluate(() => { openOrderDialog('EURUSD', 'buy');
    const lbls = [...document.querySelectorAll('#ordModal .ordlbl')].map(x => x.textContent);
    closeOrder(); return lbls; });
  ok('② ko: 주문창 라벨 심볼/수량/유형/손절/익절', ['심볼', '수량', '유형', '손절', '익절'].every(x => ord.includes(x)), JSON.stringify(ord));

  // ② ja/zh 스팟 체크 (위젯 타이틀 data-i18n 경유)
  const ja = await page.evaluate(() => { setLang('ja');
    return { sub: document.querySelector('#mwSub [data-sub="Ticks"]').textContent,
             tab: document.querySelector('#tbxTabs [data-tab="Journal"]').textContent }; });
  ok('② ja: Ticks→ティック · Journal→ジャーナル', ja.sub === 'ティック' && ja.tab === 'ジャーナル', JSON.stringify(ja));
  const zh = await page.evaluate(() => { setLang('zh');
    return { sub: document.querySelector('#mwSub [data-sub="Details"]').textContent,
             acct: (document.querySelector('#tbxBody .acctline') || {}).textContent || '' }; });
  ok('② zh: Details→详情 · 余额/净值', zh.sub === '详情' && /余额:/.test(zh.acct) && /净值:/.test(zh.acct), JSON.stringify(zh.sub));

  // ④ en 복귀 — 원문 복원
  const back = await page.evaluate(() => { setLang('en');
    return { sub: document.querySelector('#mwSub [data-sub="Symbols"]').textContent,
             tab: document.querySelector('#tbxTabs [data-tab="Trade"]').textContent,
             acct: (document.querySelector('#tbxBody .acctline') || {}).textContent || '' }; });
  ok('④ en 복귀 — Symbols/Trade/Balance 원문 복원', back.sub === 'Symbols' && back.tab === 'Trade' && /Balance:/.test(back.acct), JSON.stringify(back));

  await page.close(); await browser.close(); server.close();
  console.log((fail ? '🔴' : '🟢') + ' fx-terminal-i18n — ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ fx-terminal-i18n crashed: ' + e.message); process.exit(1); });
