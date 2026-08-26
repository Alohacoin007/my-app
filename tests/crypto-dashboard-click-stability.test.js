// Alpexa — 크립토 대시보드 클릭 안정성 게이트 (2026-08-26 사장님 신고 "+ Add 가 잘 안 눌려")
//
// 잡는 버그 클래스: **틱마다 목록을 innerHTML 로 통째로 재생성 → 클릭 타깃이 손가락 밑에서 사라짐.**
//   mkTouch 가 시세 틱마다(최대 150ms 간격 = 초당 6~7회) mkRender 를 부른다. 예전 mkRender 는
//   그때마다 `el.innerHTML = ...` 로 `.mrow` 와 `+ Add` 를 전부 파괴·재생성했다. 브라우저는
//   **mousedown 과 mouseup 의 대상이 같아야** click 을 발생시키므로, 누르는 사이에 노드가 갈리면
//   클릭이 그냥 씹힌다. 운 좋게 150ms 안에 눌렀다 떼야만 반응 = "잘 안 눌린다".
//   실피해: BTC 가 워치리스트에서 빠졌는데 **되돌릴 버튼(+ Add)이 안 눌려 복구도 막혀 있었다.**
//
// 계약 (이 테스트가 강제):
//   P1 시세 틱이 계속 와도 `+ Add` 노드의 **동일성(identity)** 이 유지된다.
//   P2 `.mrow` 노드 동일성도 유지된다 (행 클릭 = 차트 연동도 같은 이유로 깨졌었다).
//   P3 그런데도 **가격은 제자리에서 갱신**된다 (노드를 얼려서 통과시키는 부정 방지).
//   P4 mousedown → (틱 발생) → mouseup 이 **진짜 클릭으로 성립**해 팝오버가 열린다.
//   P5 목록이 실제로 바뀌면(추가/삭제) 재생성은 정상 동작한다.
//
// 네트워크 0 — WS/Supabase 없이 mkTouch 를 직접 호출해 틱을 흉내낸다.
// playwright/Chromium 없으면 SKIP(exit 0, verify 게이트 비취약).
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
if (!chromium || !exe) { console.log('⏭️  SKIP crypto-dashboard-click-stability (no playwright/chromium)'); process.exit(0); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const fp = path.join(REPO, p);
      if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' }); rq.end(fs.readFileSync(fp));
    });
    s.listen(port, () => res(s));
  });
}
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };

// 시세 틱 흉내 — 실제 WS 가 하는 것과 동일한 경로(mkTouch)를 쓴다.
//   · 가격은 매번 달라야 "제자리 갱신"(P3)을 볼 수 있다.
//   · 24h 변동률(chg)은 **심볼마다 고정**한다. 목록 정렬 기준이 chg 라서, 이게 흔들리면
//     순위가 진짜로 바뀌고 재생성이 정당해진다 — 그건 이 테스트가 볼 대상이 아니다.
//     (실제 시장에서도 24h% 는 초 단위로 순위가 뒤집히지 않는다.)
let TICK_I = 0;
const TICK = `(n)=>{ const syms=mk.list.filter(s=>s!=='ALPXS');
  for(let i=0;i<n;i++){ window.__tk=(window.__tk||0)+1;
    syms.forEach((s,j)=>{ const px=100+j*10+window.__tk*0.37;
      mkTouch(s, px, 5-j, px-0.05, px+0.05); });   // chg=5-j → 순위 고정
  }
}`;

(async () => {
  const PORT = 8871, server = await serve(PORT);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  console.log('crypto-dashboard click stability — behavior gate');

  await page.goto(`http://localhost:${PORT}/dev/crypto-dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // 워치리스트를 알려진 상태로 고정하고 한 번 그린다.
  await page.evaluate(() => { mk.list = ['BTC', 'ETH', 'SOL', 'XRP']; mk.q = {}; mkRender(); });
  // 프라이밍: 모든 심볼이 시세를 갖고 정렬이 안정될 때까지 몇 틱 돌린다.
  // (첫 틱에서는 일부만 값이 있어 chg=null → 순위가 실제로 바뀐다 = 정당한 재생성)
  for (let i = 0; i < 3; i++) { await page.evaluate(`(${TICK})(1)`); await page.waitForTimeout(200); }

  ok('목록이 렌더된다 (.mrow 4행 + .madd)',
     await page.evaluate(() => document.querySelectorAll('#mkList .mrow').length === 4 && !!document.querySelector('#mkList .madd')));

  // ── P1·P2·P3: 틱이 쏟아져도 노드는 그대로, 값만 바뀐다 ──
  const stab = await page.evaluate(`(async()=>{
    const add0=document.querySelector('#mkList .madd');
    const row0=document.querySelector('#mkList .mrow');
    const px0=row0.children[3].textContent;
    for(let k=0;k<6;k++){ (${TICK})(1); await new Promise(r=>setTimeout(r,180)); }
    const add1=document.querySelector('#mkList .madd');
    const row1=document.querySelector('#mkList .mrow');
    return { addSame: add0===add1, rowSame: row0===row1, pxChanged: row1.children[3].textContent!==px0,
             px0, px1: row1.children[3].textContent };
  })()`);
  ok('P1 시세 틱 중에도 + Add 노드 동일성 유지 (클릭 타깃이 안 사라진다)', stab.addSame, JSON.stringify(stab));
  ok('P2 .mrow 노드 동일성 유지 (행 클릭 = 차트 연동도 살아난다)', stab.rowSame, JSON.stringify(stab));
  ok('P3 그래도 가격은 제자리 갱신 (' + stab.px0 + ' → ' + stab.px1 + ')', stab.pxChanged, JSON.stringify(stab));

  // ── P4: mousedown → 틱 → mouseup 이 진짜 클릭으로 성립한다 ──
  //     예전 코드에선 이 사이에 노드가 재생성돼 click 이 발생하지 않았다.
  await page.evaluate(() => document.getElementById('mkPop').classList.remove('open'));
  const box = await page.locator('#mkList .madd').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(`(${TICK})(2)`);          // 누르고 있는 동안 시세가 계속 들어온다
  await page.waitForTimeout(200);
  await page.evaluate(`(${TICK})(2)`);
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok('P4 누른 채 틱이 와도 클릭 성립 → 코인 추가 팝오버가 열린다',
     await page.evaluate(() => document.getElementById('mkPop').classList.contains('open')));

  // ── P5: 실제 목록 변경은 여전히 재생성된다 (BTC 를 빼고 다시 넣기) ──
  const relist = await page.evaluate(`(async()=>{
    const before=mk.list.slice();
    mk.list=mk.list.filter(s=>s!=='BTC'); mkRender(); await new Promise(r=>setTimeout(r,50));
    const gone=!document.querySelector('#mkList .mrow[data-sym="BTC"]');
    mk.list=before.slice(); mkRender(); await new Promise(r=>setTimeout(r,50));
    const back=!!document.querySelector('#mkList .mrow[data-sym="BTC"]');
    return { gone, back, add: !!document.querySelector('#mkList .madd') };
  })()`);
  ok('P5 목록이 실제로 바뀌면 재생성된다 (BTC 제거 → 복귀, + Add 유지)',
     relist.gone && relist.back && relist.add, JSON.stringify(relist));

  // ── P6·P7: 코인 추가 팝오버는 **크립토 전용** 카테고리 (2026-08-26 사장님 지시) ──
  //   주식·퓨쳐스·인덱스는 이 대시보드가 다루지 않는다. 없는 상품을 "Soon"으로 걸어두면
  //   있는 척이 된다 — "거래 불가한데 가능처럼 보이면 안 된다"는 피드 규율과 같은 원칙.
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('#mkPop .chips .chip')].map(c => (c.dataset.c || '') + ':' + c.textContent.trim()));
  ok('P6 카테고리 = 크립토 전용 (주식·퓨쳐스·인덱스 없음)',
     chips.join('|') === 'all:All|crypto:Crypto|memes:Memes|stable:Stablecoins|sto:STO', JSON.stringify(chips));

  const cats = await page.evaluate(`(async()=>{
    const pick=async(c)=>{ mk.pcat=c; mkRenderPlist(); await new Promise(r=>setTimeout(r,30));
      return [...document.querySelectorAll('#mkPlist .prow')].map(x=>x.dataset.sym); };
    const sto=await pick('sto'); const grp=document.getElementById('mkGrp').textContent;
    return { sto, grp, stable: await pick('stable'), memes: await pick('memes'), crypto: await pick('crypto') };
  })()`);
  ok('P7 STO = ALPXS 한 개 (그룹 라벨 "' + cats.grp + '")',
     cats.sto.join(',') === 'ALPXS', JSON.stringify(cats.sto));
  ok('P7 Stablecoins = 서버 prices 에 값이 있는 3종만 (USDT·USDC·DAI)',
     cats.stable.join(',') === 'USDT,USDC,DAI', JSON.stringify(cats.stable));
  ok('P7 Memes 목록이 채워져 있다 (' + cats.memes.length + '종)',
     cats.memes.length >= 4 && cats.memes.includes('DOGE') && cats.memes.includes('PEPE'), JSON.stringify(cats.memes));
  ok('P7 Crypto(메이저)에 밈·스테이블·STO 가 섞이지 않는다',
     cats.crypto.includes('BTC') && !cats.crypto.includes('DOGE')
       && !cats.crypto.includes('USDT') && !cats.crypto.includes('ALPXS'), JSON.stringify(cats.crypto));

  await browser.close(); server.close();
  console.log(fail ? `\n🔴 FAIL — ${fail}건 (pass ${pass})` : `\n🟢 PASS — ${pass}건: 시세가 흘러도 클릭 타깃이 살아있다.`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('🔴 크래시: ' + e.message); process.exit(1); });
