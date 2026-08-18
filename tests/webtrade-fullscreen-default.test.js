#!/usr/bin/env node
// BEHAVIOUR PIN — webtrade 기본값 풀스크린 (사장님 2026-08-15 "로그인하면 풀스크린 안 되는데").
//
// 왜 행위 핀인가: 이 기능은 **정적 검사를 통과한 채로 안 됐다.** 기존 핀은
// `if(!(window.AlpexaSync && AlpexaSync.me)) return;` 라는 **문구가 있는지**만 봤는데,
// `AlpexaSync.me` 는 값이 아니라 **함수**라 항상 truthy = 그 가드는 아무것도 안 막고 있었다.
// (헤드리스 실측: 미로그인 상태에서도 풀스크린이 걸렸다.) 문구가 아니라 **동작**을 잰다.
//
// 실측으로 확인한 두 결함 (2026-08-15, playwright 계측):
//   ① 로그인 가드가 죽어 있음 — 미로그인에도 1회 걸림 (위 이유)
//   ② opt-out 이 탭 수명 내내 붙어 있음 — ⛶ 로 한 번 나가면 **다시 로그인해도** 안 걸림.
//      사장님이 "버튼 누르면 브라우저 보이게" 를 테스트하느라 나간 그 탭에서 계속 안 됐던 이유.
//
// 계약
//  A. 새 탭 + 로그인            → 첫 상호작용에 1회, 두 번째엔 0회 (1회성)
//  B. ⛶ 로 직접 나간 탭         → 0회 (사용자 의사 우선 — 나가자마자 다시 들어가면 안 된다)
//  C. B 상태에서 **새로 로그인** → 1회 (새 로그인 = 기본값 복귀. login.html 의 alpexa.loginChime 이 신호)
//  D. 미로그인 (둘러보기)        → 0회 (읽기전용 방문자에게 전체화면 강요 금지)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT_DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT_DIR, 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ── armDefaultFullscreen 을 통째로 뽑아 Node 에서 스텁으로 돌린다 (브라우저·CDN 불필요) ──
const block = (src.match(/const FS_OPTOUT = [\s\S]*?\n\}\n/) || [''])[0];
if (!/function armDefaultFullscreen\(\)/.test(block)) {
  bad('armDefaultFullscreen 블록을 추출할 수 없다 (이름이나 위치가 바뀌었나?)');
  console.error('\n🔴 FAIL — 1건.'); process.exit(1);
}

function makeEnv({ loggedIn, optout, freshLogin, installed }) {
  const store = (init) => { const m = Object.assign({}, init); return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  }; };
  const ss = store(Object.assign({}, optout ? { 'wt.fs.optout': '1' } : {},
                                     freshLogin ? { 'alpexa.loginChime': '1' } : {}));
  const ls = store(loggedIn ? { 'alpexa.me': JSON.stringify({ custId: 'FX-1', accts: { fx: 'FX-1' } }) } : {});
  const listeners = [];
  const env = {
    calls: 0, ss, ls,
    // 클릭 1번 = pointerdown **하나만** 발화 (keydown 리스너까지 같이 부르면 실제보다 2배로 센다)
    interact() { const l = listeners.find((x) => x.type === 'pointerdown'); if (l) l.fn(); },
  };
  env.document = {
    documentElement: { requestFullscreen() { env.calls++; return { catch() {} }; } },
    addEventListener(type, fn, cap) { listeners.push({ type, fn, cap }); },
    removeEventListener(type, fn, cap) {
      for (let i = listeners.length - 1; i >= 0; i--)
        if (listeners[i].type === type && listeners[i].fn === fn && listeners[i].cap === cap) listeners.splice(i, 1);
    },
  };
  // me() 는 로그인 안 돼 있어도 임시 Guest 객체를 만들어 준다 = 값으로 로그인 판정 불가
  env.window = {
    AlpexaSync: { me: () => JSON.parse(ls.getItem('alpexa.me') || 'null') || { custId: 'P-0000', name: 'Guest' } },
    // 설치형 PWA(manifest display:fullscreen)면 창 자체가 이미 전체화면 → API 를 또 부르면 안 된다
    matchMedia: (q) => ({ matches: !!installed && /display-mode:\s*(fullscreen|standalone)/.test(q) }),
  };
  return env;
}

function run(opts) {
  const env = makeEnv(opts);
  let arm;
  try {
    // 코드가 `window.AlpexaSync` 가 아니라 **맨 이름 `AlpexaSync`** 도 참조한다 → 둘 다 주입.
    // (브라우저에선 전역이라 같지만, 없으면 ReferenceError 가 바깥 try/catch 에 조용히 먹혀
    //  기능이 통째로 사라진다 — 이 침묵도 이 버그가 오래 안 보인 이유 중 하나다.)
    arm = new Function('document', 'window', 'sessionStorage', 'localStorage', 'fsElement', 'AlpexaSync', 'matchMedia',
      block + '\nreturn armDefaultFullscreen;')(env.document, env.window, env.ss, env.ls, () => null, env.window.AlpexaSync, env.window.matchMedia);
  } catch (e) { bad('armDefaultFullscreen 평가 실패: ' + e.message); return { calls: 0, again: 0 }; }
  arm();
  env.interact(); const first = env.calls;
  env.interact(); const again = env.calls - first;
  return { calls: first, again };
}

const CASES = [
  ['A. 새 탭 + 로그인',            { loggedIn: true,  optout: false, freshLogin: false }, 1, '로그인 후 첫 상호작용에 풀스크린이 걸려야 한다'],
  ['B. ⛶ 로 직접 나간 탭',         { loggedIn: true,  optout: true,  freshLogin: false }, 0, '사용자가 나갔으면 그 탭에선 다시 걸지 않는다'],
  ['C. 나간 탭에서 새로 로그인',    { loggedIn: true,  optout: true,  freshLogin: true  }, 1, '새 로그인 = 기본값 복귀 (이게 안 돼서 "로그인해도 풀스크린 안 됨")'],
  ['D. 미로그인 둘러보기',          { loggedIn: false, optout: false, freshLogin: false }, 0, '읽기전용 방문자에게 전체화면을 강요하면 안 된다'],
  // E. 설치형 앱(PWA) — 창이 이미 전체화면이라 API 요청은 군더더기. A(브라우저 탭 폴백)와 공존해야 한다.
  ['E. 설치형 앱으로 실행',        { loggedIn: true,  optout: false, freshLogin: false, installed: true }, 0, '설치형은 창 자체가 전체화면 — 첫 클릭마다 불필요한 요청이 또 가면 안 된다'],
];
for (const [label, opts, want, why] of CASES) {
  const r = run(opts);
  if (r.calls !== want) bad(`${label}: 첫 상호작용 ${r.calls}회 (기대 ${want}회) — ${why}`);
  else if (want === 1 && r.again !== 0) bad(`${label}: 두 번째 상호작용에도 ${r.again}회 — 1회성이어야 한다 (사용자가 나갈 때마다 다시 들어간다)`);
}

// ── 설치형(PWA) 배선: PC 터미널 전용 매니페스트가 붙어 있고, 모바일 것과 섞이지 않는가 ──
// 2026-08-17 사장님 "로그인하면 풀스크린으로 보이게 안돼?" → 브라우저 탭에선 규격상 제스처가
// 필수(실측: 로그인 페이지에서 얻은 전체화면은 이동하며 해제됨). 설치형 앱만이 클릭 없이 된다.
{
  if (!/<link rel="manifest" href="manifest-terminal\.json/.test(src))
    bad('webtrade 에 PC 터미널 매니페스트가 연결돼 있지 않다 — 설치해도 전체화면으로 안 열린다');
  if (/<link rel="manifest" href="manifest\.json/.test(src))
    bad('webtrade 가 **모바일** manifest.json 을 물었다 — standalone·portrait 이라 PC 가 세로 고정 앱이 된다');
  const tm = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest-terminal.json'), 'utf8'));
  if (tm.display !== 'fullscreen') bad(`manifest-terminal.json 의 display 가 '${tm.display}' — 'fullscreen' 이어야 클릭 없이 전체화면`);
  if (!/webtrade/.test(tm.start_url || '')) bad('manifest-terminal.json 의 start_url 이 터미널이 아니다');
  if (tm.orientation) bad(`PC 매니페스트에 orientation('${tm.orientation}') 이 있다 — 데스크톱은 고정하지 않는다`);
  const mob = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
  if (mob.display !== 'standalone' || mob.orientation !== 'portrait')
    bad('모바일 manifest.json 이 바뀌었다 — PC 작업이 모바일 앱 설치를 건드리면 안 된다');
}

// ── 죽은 가드 재발 방지: 로그인 판정을 **함수 존재**로 하면 안 된다 ──
if (/if\(!\(window\.AlpexaSync && AlpexaSync\.me\)\) return;/.test(src))
  bad('로그인 판정이 `AlpexaSync.me` (함수) 의 존재 여부다 — 항상 truthy 라 아무것도 안 막는다. alpexa.me 를 봐야 한다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log('🟢 PASS: 기본값 풀스크린 — 로그인 첫 상호작용 1회(1회성) · ⛶ 로 나간 탭은 존중 · 새 로그인엔 복귀 · 미로그인엔 안 걸림.');
