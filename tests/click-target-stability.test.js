#!/usr/bin/env node
// Alpexa — 클릭 타깃 안정성 전수 스모크 (2026-08-31 사장님 지시 ②)
// ============================================================================
// 잡는 버그 클래스: **화면은 멀쩡히 그려지는데 버튼이 안 눌린다.**
//
//   2026-08-26 사장님 신고 "크립토 추가하는 버튼이 클릭이 잘 안 돼". 원인은 렌더가 아니라
//   **시세 틱마다 목록을 innerHTML 로 통째로 다시 만드는 것**이었다. 브라우저는 mousedown 과
//   mouseup 이 **같은 노드**에서 일어나야 click 을 발생시킨다. 누르는 사이(보통 100~200ms)에
//   노드가 갈리면 클릭이 그냥 씹힌다. 실피해: BTC 가 목록에서 빠졌는데 **되돌릴 버튼이
//   안 눌려 복구까지 막혔다** — 버그가 자기 수리를 막은 형태.
//
//   왜 기존 감시가 못 잡았나: `visual-smoke` 는 "에러 없이 그려지나"만 본다. 그려지는 건
//   정상이었다. **아무도 눌러보지 않았다.** 그래서 유일한 신호가 사장님 신고였다.
//   (crypto-dashboard 한 화면에는 전용 핀을 박았지만, 나머지 앱은 여전히 무방비였다.)
//
// ⚠️ 처음엔 페이지를 **가만히 두고** 지켜봤다 — 그리고 크립토 대시보드의 가드를 일부러
//    무력화(RED 주입)했는데도 🟢 가 나왔다. 헤드리스에는 시세 WS 가 없어 틱이 안 오고,
//    틱이 없으면 목록을 다시 그리지 않으니 **버그가 재현될 기회 자체가 없었다.**
//    검사가 잡으려는 바로 그 클래스에 대해 헛초록이었던 것. 그래서 지금은 **앱의 렌더
//    함수를 직접 호출해 흔든다** — 틱이 왔을 때와 같은 경로다. 흔들 손잡이를 못 찾으면
//    통과시키지 않고 "검사 불가"로 보고한다 (모르면 모른다고 해야 한다).
//
// 어떻게 보나 — 이름·데이터가 아니라 **노드 동일성**을 본다:
//   ① 페이지를 띄우고 안정될 때까지 기다린 뒤, 보이는 조작 요소마다 표식을 붙인다.
//   ② 시세 틱이 계속 도는 채로 2.5초 기다린다 (사람이 버튼을 누르는 시간보다 길게).
//   ③ 표식이 사라졌는데 **같은 글자의 버튼은 그대로 있으면** = 필요 없이 다시 만들어진 것
//      = 손가락 밑에서 노드가 갈리는 상태 = 🔴.
//   글자가 바뀐 요소는 안 잡는다 — 데이터가 진짜 바뀌어 다시 그리는 건 정상이다.
//
// 🛡️ 헛초록 방지: 선택자가 아무것도 못 잡으면 모든 페이지가 조용히 통과한다. 그래서
//    페이지마다 **최소 조작 요소 수**를 요구한다 — 0개면 검사가 고장난 것이지 앱이 완벽한 게 아니다.
//    ("이 검사는 내가 틀렸을 때 빨강이 되나?" — CLAUDE.md)
//
// playwright/Chromium 없으면 SKIP(exit 0) — verify 게이트를 취약하게 만들지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let chromium;
try { chromium = require('playwright-core').chromium; }
catch (_e) { console.log('  ⏭️  SKIP click-target-stability — playwright-core 없음'); process.exit(0); }

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base).filter((x) => /chromium/.test(x)))
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const f = path.join(base, d, c); if (fs.existsSync(f)) return f;
      }
  } catch (_e) {}
  return null;
}

// visual-smoke 와 같은 스텁(로그인된 신원 + Supabase 목). 같은 것을 두 번 짜면 갈린다.
const SMOKE = fs.readFileSync(path.join(__dirname, 'visual-smoke.js'), 'utf8');
const INIT = (SMOKE.match(/^const INIT = `([\s\S]*?)^`;/m) || [])[1];
if (!INIT) { console.log('  ⏭️  SKIP click-target-stability — visual-smoke 의 INIT 스텁을 못 읽음'); process.exit(0); }

// 고객이 실제로 손대는 화면. 로그인 스텁으로 열리는 것만 (인증 벽 뒤는 별도 테스트 몫).
// minCtl = 이만큼은 조작 요소가 보여야 정상 (헛초록 방지 하한).
// drivers = 시세 틱이 실제로 부르는 **최상위 렌더 함수**. 헤드리스엔 WS 가 없으니
// 우리가 대신 부른다 (crypto-dashboard-click-stability 가 mkTouch 로 하던 것의 일반화).
// 하나도 못 찾으면 그 화면은 **통과가 아니라 "검사 불가"** 다.
const PAGES = [
  { f: 'index.html',                minCtl: 3, drivers: ['render', 'paint', 'renderTicker'] },
  { f: 'sports-live.html',          minCtl: 5, drivers: ['renderGames', 'renderAll', 'render', 'paint'] },
  { f: 'crypto-live.html',          minCtl: 5, drivers: ['render', 'paint'] },
  { f: 'trading.html',              minCtl: 5, drivers: ['render', 'paint'] },
  { f: 'webtrade.html',             minCtl: 5, drivers: ['renderAll', 'render', 'paint'] },
  { f: 'dev/crypto-dashboard.html', minCtl: 5, drivers: ['mkRender', 'renderAll'] },
  { f: 'sportsbook-desk.html',      minCtl: 3, drivers: ['renderAll', 'renderKpi'] },
  { f: 'pamm-desk.html',            minCtl: 3, drivers: ['renderAll', 'renderKpi'] },
];

const SETTLE_MS = 3000;   // CDN 스크립트(차트 엔진 등) 로드까지 여유   // 초기 렌더가 자리잡을 시간
const WATCH_MS = 2200;    // 사람이 누르고 떼는 시간보다 넉넉히 길게

// 브라우저 안에서 도는 코드 — 조작 요소에 표식을 붙인다.
const TAG = `() => {
  const sel = 'button, [role="button"], .chip, .tab, .madd, .mrow, [onclick], a[href="#"]';
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; };
  const shown = [...document.querySelectorAll(sel)].filter(vis);
  // 글자가 **유일한** 요소만 본다. 같은 글자가 여러 개면(닫기 "×" 3개 등) 하나가 정상적으로
  // 사라진 것과 노드가 갈린 것을 구분할 수 없다 — 구분 못 하는 건 주장하지 않는다.
  // (진짜 조작 버튼은 "+ Add"·"Deposit" 처럼 라벨이 고유하므로 이 필터로 놓치지 않는다.)
  const cnt = {};
  shown.forEach((e) => { const t = (e.textContent || '').trim().slice(0, 40); cnt[t] = (cnt[t] || 0) + 1; });
  const out = [];
  let i = 0;
  shown.forEach((e) => {
    const txt = (e.textContent || '').trim().slice(0, 40);
    if (!txt || txt.length < 2) return;     // 글자 없거나 1글자 아이콘은 같은-글자 비교가 무의미
    if (cnt[txt] !== 1) return;             // 중복 라벨 → 판정 불가 → 제외
    const id = 'cts' + (i++);
    e.setAttribute('data-cts', id);
    out.push({ id, txt });
  });
  return out;
}`;

// 표식이 살아있나 + (죽었다면) 같은 글자 버튼이 여전히 있나 = 필요 없는 재생성
const CHECK = `(tagged) => {
  const alive = [], reborn = [];
  for (const t of tagged) {
    if (document.querySelector('[data-cts="' + t.id + '"]')) { alive.push(t.id); continue; }
    const same = [...document.querySelectorAll('button, [role="button"], .chip, .tab, .madd, .mrow, [onclick], a[href="#"]')]
      .some((e) => (e.textContent || '').trim().slice(0, 40) === t.txt);
    if (same) reborn.push(t.txt);          // 글자는 그대로인데 노드가 갈렸다 = 클릭 타깃 소멸
  }
  return { alive: alive.length, reborn };
}`;

(async () => {
  const exe = findChromium();
  if (!exe) { console.log('  ⏭️  SKIP click-target-stability — Chromium 없음'); process.exit(0); }
  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] }); }
  catch (e) { console.log('  ⏭️  SKIP click-target-stability — Chromium 실행 실패: ' + e.message.slice(0, 80)); process.exit(0); }

  let fail = 0, checked = 0, skipped = 0;
  console.log('클릭 타깃 안정성 — 시세가 흘러도 버튼이 손가락 밑에서 사라지지 않는가');

  for (const P of PAGES) {
    const fp = path.join(ROOT, P.f);
    if (!fs.existsSync(fp)) continue;
    const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // 외부 스크립트가 샌드박스에서 막히면(unpkg 등) 앱이 아예 못 뜬다 — 그건 우리 버그가
    // 아니라 환경 제약이다. "0개 = 실패" 와 "0개 = CDN 차단" 을 구분하려고 실패를 센다.
    const blockedScripts = [];
    pg.on('requestfailed', (r) => { if (r.resourceType() === 'script') blockedScripts.push(r.url()); });
    try {
      await pg.addInitScript(INIT);
      // 오프라인 샌드박스에서 <head> 의 Google-Fonts / CDN 스크립트가 매달리면 **파싱 자체가
      // 멈춰** body 도 안 생긴다(첫 판에 document.body 가 null 이었던 원인). visual-smoke 가
      // agent.html 에만 쓰던 처리를 여기선 전 페이지에 건다 — 우리는 "그려지나"가 아니라
      // "눌리나"를 보는 검사라 앱이 뜨는 게 전제다.
      // 폰트·스타일시트만 즉시 비워서 응답한다(<head> 에서 매달려 파싱을 멈추는 주범).
      // **스크립트는 통과시킨다** — 막으면 webtrade 가 "compiling chart engine" 에서 멈춰
      // 버튼이 아예 안 생긴다. 우리는 앱이 실제로 돌아가는 상태에서 눌러봐야 한다.
      await pg.route(/^https?:\/\//, (r) => { const t = r.request().resourceType();
        if (t === 'stylesheet' || t === 'font' || t === 'image') return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
        return r.continue(); });
      await pg.goto('file://' + fp, { waitUntil: 'commit', timeout: 15000 });
      await pg.waitForTimeout(SETTLE_MS);
      await pg.waitForFunction(() => !!document.body, null, { timeout: 8000 }).catch(() => {});

      const tagged = await pg.evaluate(`(${TAG})()`);
      checked++;

      if (tagged.length < P.minCtl) {
        if (blockedScripts.length) {
          // 환경 제약 — CI(네트워크 있음)에서는 정상적으로 검사된다. 통과로 세지 않는다.
          console.log(`  ⏭️  ${P.f}: 외부 스크립트 ${blockedScripts.length}개 차단으로 앱 미기동 — 이 환경에선 검사 불가`);
          console.log(`       ${blockedScripts[0].slice(0, 64)}`);
          skipped++; checked--; await pg.close(); continue;
        }
        // 차단이 없었는데도 0개면 **검사가 눈이 먼 것**이다 — 앱이 완벽한 게 아니다.
        console.log(`  ❌ ${P.f}: 조작 요소 ${tagged.length}개 (최소 ${P.minCtl} 기대) — 화면이 안 떴거나 선택자가 고장났다`);
        fail++; await pg.close(); continue;
      }

      // 시세 틱이 왔을 때와 같은 경로로 앱을 흔든다 (가만히 두면 버그가 재현될 기회가 없다).
      const shook = await pg.evaluate(`(async (names) => {
        const found = names.filter((n) => typeof window[n] === 'function');
        let calls = 0;
        for (let k = 0; k < 8; k++) {
          for (const n of found) { try { window[n](); calls++; } catch (e) {} }
          await new Promise((r) => setTimeout(r, 220));
        }
        return { found, calls };
      })(${JSON.stringify(P.drivers)})`);

      if (!shook.found.length) {
        console.log(`  ⏭️  ${P.f}: 렌더 손잡이(${P.drivers.join('/')})를 못 찾아 흔들 수 없다 — 검사 불가`);
        skipped++; checked--; await pg.close(); continue;
      }
      const r = await pg.evaluate(`(${CHECK})(${JSON.stringify(tagged)})`);

      if (r.reborn.length) {
        console.log(`  ❌ ${P.f}: 앱을 흔드니 ${r.reborn.length}개 조작 요소가 다시 만들어졌다 (클릭이 씹힌다)`);
        console.log(`       ${[...new Set(r.reborn)].slice(0, 6).map((t) => '"' + t + '"').join(', ')}`);
        fail++;
      } else {
        console.log(`  ✅ ${P.f}: 조작 요소 ${tagged.length}개 · ${shook.found.join('/')}() ${shook.calls}회 호출에도 노드 동일성 유지`);
      }
    } catch (e) {
      // 🚨 로드/평가 실패는 **건너뛰기가 아니라 실패**다. 첫 판에 여기서 걸렸는데
      //    조용히 넘어가 8개 화면 전부 에러인 채로 🟢 PASS 가 나왔다 — 이 검사가 잡으려던
      //    "헛초록" 을 이 검사가 스스로 저지른 셈. 검사가 못 봤으면 못 봤다고 빨개져야 한다.
      console.log(`  ❌ ${P.f}: 검사 불가 — ${String(e.message).slice(0, 80)}`);
      fail++;
    }
    await pg.close();
  }

  await browser.close();
  if (!checked) { console.log('  ⏭️  SKIP — 검사한 페이지 없음'); process.exit(0); }
  if (fail) {
    console.log(`\n🔴 FAIL — ${fail}개 화면에서 클릭 타깃이 불안정하다.`);
    console.log('   고치는 법: 목록을 innerHTML 로 통째로 다시 만들지 말고, 구성이 같으면');
    console.log('   노드를 유지한 채 숫자만 칠한다 (dev/crypto-dashboard.html 의 mkPaintRow 패턴).');
    process.exit(1);
  }
  console.log(`\n🟢 PASS — ${checked}개 화면, 시세가 흘러도 버튼이 살아있다.` + (skipped ? ` (환경 제약 ${skipped}개 건너뜀)` : ''));
  process.exit(0);
})().catch((e) => { console.error('🔴 크래시: ' + e.message); process.exit(1); });
