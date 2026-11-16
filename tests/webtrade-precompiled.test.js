#!/usr/bin/env node
// Alpexa — PC 웹트레이드: 배포본은 **미리 컴파일**해서 싣는다 (2026-11-16 앱 분석 3단계 ②, 사장님 "3단계 진행해")
// ============================================================================
// 왜: webtrade.html 은 고객 PC 가 매번 약 3MB 짜리 Babel 을 내려받아 3,300줄 JSX 를 그 자리에서 컴파일한 뒤에야 떴다
//     (크립토·옛 FX 모바일은 2026-07-31 에 이미 사전 컴파일로 바꿨는데 웹트레이드만 남아 있었다).
// 방법: 리포의 webtrade.html 은 **그대로 원본**(JSX 인라인 — 이 파일을 읽는 테스트 90여 개 무변경, 로컬에서 바로 열림).
//       공개 묶음을 만들 때(tools/build-site.js) JSX 블록을 컴파일해 vendor/webtrade-compiled.js 로 빼고,
//       Babel 스크립트 태그를 지운 webtrade.html 을 싣는다. 컴파일러 = 브라우저가 쓰던 것과 같은 Babel(react 프리셋, script).
// 안전장치: 변환 전제(JSX 블록 1개 · Babel 태그 1개)가 어긋나면 **빌드가 실패**한다 = 배포 중단(옛 버전 유지).
//           깨진 화면을 싣는 것보다 안 싣는 게 낫다.
// 돈: 0줄 (주문·청산 RPC 코드는 글자 그대로 컴파일될 뿐).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), http = require('http'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };

const bs = require('../tools/build-site.js');
const src = fs.readFileSync(path.join(REPO, 'webtrade.html'), 'utf8');

// ── A. 원본은 그대로 (개발용 · 테스트 기준) ───────────────────────────────────
ok('A. 리포의 webtrade.html 은 원본 그대로 (JSX 인라인 블록 1개)', (src.match(/<script type="text\/babel"/g) || []).length === 1);

// ── B. 변환 결과 ─────────────────────────────────────────────────────────────
const hasFn = typeof bs.precompilePage === 'function';
ok('B. tools/build-site.js 에 precompilePage 가 있다', hasFn);
let out = null;
if (hasFn) { try { out = bs.precompilePage(src, 'vendor/webtrade-compiled.js'); } catch (e) { ok('B. 변환이 예외 없이 끝난다', false, e.message); } }
if (out) {
  ok('B. 배포본 html 에 text/babel 블록 0 · Babel 스크립트 태그 0', !/text\/babel/.test(out.html.replace(/<!--[\s\S]*?-->/g, '')) && !/@babel\/standalone/.test(out.html));
  const tag = out.html.match(/<script defer src="vendor\/webtrade-compiled\.js\?v=([a-f0-9]{8})"><\/script>/g) || [];
  ok('B. 배포본 html 이 컴파일본을 defer 로 1번 싣는다 (?v=내용해시)', tag.length === 1);
  const h = crypto.createHash('sha1').update(out.js).digest('hex').slice(0, 8);
  ok('B. ?v= 값 = 컴파일본 내용 해시 (내용이 바뀌면 주소가 바뀐다 = 캐시 자동 갱신)', out.html.includes('webtrade-compiled.js?v=' + h) && out.hash === h);
  // 그 두 군데 말고는 한 글자도 안 바뀐다
  const strip = (s) => s.replace(/<script type="text\/babel"[^>]*>[\s\S]*?<\/script>/, '@@APP@@').replace(/[ \t]*<script[^>]*@babel\/standalone[^>]*><\/script>\n?/, '');
  ok('B. 그 두 군데(Babel 태그 삭제 · 앱 블록 교체) 말고는 원본과 한 글자도 다르지 않다',
     strip(src) === out.html.replace(/<script defer src="vendor\/webtrade-compiled\.js\?v=[a-f0-9]{8}"><\/script>/, '@@APP@@'));
  let parsed = true; try { new vm.Script(out.js); } catch (e) { parsed = e.message; }
  ok('B. 컴파일본은 일반 자바스크립트로 구문 분석된다 (JSX 0)', parsed === true, String(parsed));
  ok('B. 컴파일본에 앱 기동·핵심 객체가 들어 있다 (createRoot · priceStore · terminalBus)',
     /ReactDOM\.createRoot\(document\.getElementById\('app'\)\)/.test(out.js) && /const priceStore = \{/.test(out.js) && /const terminalBus = \{/.test(out.js));
  ok('B. 다른 스크립트 순서는 그대로 (supabase → sync → charts → react → react-dom → 앱)',
     /supabase\.min\.js[\s\S]*alpexa-sync\.js[\s\S]*lightweight-charts[\s\S]*react@[\s\S]*react-dom@[\s\S]*webtrade-compiled\.js/.test(out.html));
  // 실패는 닫힌 쪽으로: 전제가 어긋나면 던진다 (깨진 화면을 싣지 않는다)
  const throws = (h) => { try { bs.precompilePage(h, 'vendor/x.js'); return false; } catch (e) { return true; } };
  ok('B. JSX 블록이 없으면 빌드 실패', throws(src.replace(/<script type="text\/babel"[^>]*>[\s\S]*?<\/script>/, '')));
  ok('B. JSX 블록이 2개면 빌드 실패', throws(src + '\n<script type="text/babel" data-presets="react">const a=1;</script>'));
  ok('B. Babel 태그를 못 찾으면 빌드 실패 (지울 게 없는데 지운 척하지 않는다)', throws(src.replace(/@babel\/standalone/, '@babel/other')));
  ok('B. JSX 가 구문 오류면 빌드 실패', throws(src.replace('<script type="text/babel" data-presets="react">', '<script type="text/babel" data-presets="react">\nconst = ;')));
}

// ── C. 실제 묶음 ─────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-site-'));
let built = false;
try { execFileSync('node', [path.join(REPO, 'tools', 'build-site.js'), tmp], { stdio: 'pipe' }); built = true; } catch (e) { ok('C. 묶음 생성 성공', false, String(e.stderr || e.message).slice(0, 200)); }
const bHtml = built && fs.existsSync(path.join(tmp, 'webtrade.html')) ? fs.readFileSync(path.join(tmp, 'webtrade.html'), 'utf8') : '';
const bJs = built && fs.existsSync(path.join(tmp, 'vendor', 'webtrade-compiled.js')) ? fs.readFileSync(path.join(tmp, 'vendor', 'webtrade-compiled.js'), 'utf8') : '';
ok('C. 묶음의 webtrade.html = 변환 결과 · vendor/webtrade-compiled.js 가 같이 실린다', !!out && bHtml === out.html && bJs === out.js);
ok('C. 묶음에서 Babel 을 쓰는 고객 화면 = 0 (시안 fx-dashboard-preview.html 제외)',
   built && fs.readdirSync(tmp).filter((f) => /\.html$/.test(f) && f !== 'fx-dashboard-preview.html')
     .every((f) => !/<script type="text\/babel"/.test(fs.readFileSync(path.join(tmp, f), 'utf8'))));

// ── D. 실브라우저: 묶음의 webtrade.html 이 Babel 없이 뜬다 ─────────────────────
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) { const f = path.join(base, d, c); if (fs.existsSync(f)) return f; }
  } catch (_) {}
  return null;
}
let chromium = null;
try { chromium = require(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (_) {}
const exe = findChromium();
const done = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${fail ? '🔴' : '🟢'} webtrade-precompiled — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!chromium || !exe || !bHtml) { console.log('  ⏭️  D. 실브라우저 기동 확인 생략 (playwright/chromium 없음)'); done(); }
else (async () => {
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
  const server = http.createServer((q, r) => { const fp = path.join(tmp, decodeURIComponent(q.url.split('?')[0]));
    if (!fp.startsWith(tmp) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); r.end(fs.readFileSync(fp)); });
  await new Promise((z) => server.listen(0, z));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const errs = [], babelReq = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    const VENDOR = { 'lightweight-charts': 'lightweight-charts.standalone.production.js', 'react-dom': 'react-dom.production.min.js', 'react@': 'react.production.min.js' };
    await page.route((u) => !String(u).startsWith(base), (route) => {
      const u = route.request().url();
      if (/babel/i.test(u)) { babelReq.push(u); return route.abort(); }          // Babel 은 아예 막는다 — 없어도 떠야 한다
      const hit = Object.keys(VENDOR).find((k) => u.includes(k));
      if (hit) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(REPO, 'tests', 'vendor', VENDOR[hit])) });
      return route.abort();
    });
    await page.goto(base + '/webtrade.html', { waitUntil: 'domcontentloaded' });
    let booted = true;
    try { await page.waitForFunction(() => typeof terminalBus !== 'undefined' && typeof priceStore !== 'undefined' && document.querySelectorAll('.menu .mi').length >= 5, null, { timeout: 30000 }); }
    catch (e) { booted = false; }
    ok('D. 묶음의 webtrade 가 Babel 없이 뜬다 (메뉴줄 렌더 · terminalBus · priceStore)', booted);
    ok('D. Babel 을 요청조차 하지 않는다', babelReq.length === 0, babelReq.join(' '));
    ok('D. 기동 중 잡히지 않은 오류 0', errs.length === 0, errs.join(' | '));
    const boot = await page.evaluate(() => !document.getElementById('wt-boot'));
    ok('D. 기동 화면(wt-boot)이 앱으로 바뀌었다', boot);
  } finally { await browser.close(); server.close(); }
  done();
})().catch((e) => { console.error('❌ webtrade-precompiled crashed: ' + e.message); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
