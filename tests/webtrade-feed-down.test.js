#!/usr/bin/env node
// Alpexa — webtrade: 시세가 끊기면 **멈춘다** (가짜로 움직이지 않는다) + 끊김을 알린다
// (2026-11-15 앱 분석 1단계 #4 — 표·불변식 승인: 사장님 "4번 진행해")
// ============================================================================
// 불변식: 화면의 시세·손익은 서버(feed/prices)나 거래소(Binance WS)에서 **받은 값으로만** 움직인다.
//         못 받으면 마지막 값에서 멈추고, 한 번도 못 받은 종목은 값이 없다("—"), 끊김을 화면에 표시한다.
//
// 버그(옛 코드): priceStore.pull() 이 실패하면 `_simulate()` 가 돌아
//   · 열린 시장의 모든 종목을 마지막 값에서 **랜덤워크**시켰고 (플로팅 손익도 같이 가짜로 움직임)
//   · 시세를 한 번도 못 받은 종목은 **하드코딩 시작가(BASE)** 로 채웠다 (EURUSD 1.143 같은 옛 숫자)
//   · 화면엔 끊겼다는 표시가 없었다 (StatusBar 는 렌더 0곳, 메뉴의 Live 표시는 2026-08-13 제거).
//   실제로 2026-10-30 · 11-02 · 11-03 Supabase 장애 동안 PC 고객은 가짜로 움직이는 시세·손익을 봤을 것.
//   CLAUDE.md "손익=실시간 피드 mid로 마크(시뮬 드리프트로 P&L 금지)" 위반.
//   Market Watch → Ticks 탭도 열 때마다 랜덤 220개로 "틱 이력"을 지어냈다.
//
// 돈: 0줄. 체결가는 지금처럼 서버(fx_open/fx_close)가 정한다 — 이 테스트가 다루는 건 **표시**뿐.
// 행위 테스트는 webtrade.html 에서 실제 소스 블록을 뽑아 Node 에서 돌린다 (네트워크 0 · 브라우저 불필요).
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const grab = (re) => { const m = src.match(re); return m ? m[0] : ''; };

// ── 정적: 시세 저장소에 가짜 값이 들어올 길이 없다 ─────────────────────────────
const storeBlock = grab(/const priceStore = \{[\s\S]*?\npriceStore\.notify = /);
ok('priceStore 블록을 찾았다', !!storeBlock);
ok('① priceStore 안에 Math.random 없음 (랜덤워크·호가 흔들기 0)', !!storeBlock && !/Math\.random/.test(storeBlock));
ok('① 시뮬레이터(_simulate) 자체가 없음', !/_simulate/.test(src));
ok('② priceStore 는 하드코딩 시작가(BASE)를 읽지 않는다', !!storeBlock && !/BASE\[/.test(storeBlock));
const ticksBlock = grab(/function TickChart\(\{ symbol \}\)\{[\s\S]*?className="mwtick"/);
ok('④ Ticks 탭: 랜덤으로 지어낸 틱 이력 없음', !!ticksBlock && !/Math\.random/.test(ticksBlock) && !/BASE\[/.test(ticksBlock));
ok('③ 끊김 경고가 메뉴줄에 렌더된다 (priceStore.feedDown() → .conn-down)',
   /priceStore\.feedDown\(\)/.test(src) && /className="conn-down"/.test(src) && /\.menu \.conn-down\{/.test(src));
ok('③ 정상일 땐 표시 없음 — 경고는 down 일 때만 (2026-08-13 사장님 "상태 표시 제거" 유지)',
   /\{down && <span className="conn-down"/.test(src));
ok('③ 메뉴줄이 1초마다 스스로 다시 잰다 (요청이 매달려 알림이 안 와도 경고가 켜진다)',
   /const chk=\(\)=>setDown\(priceStore\.feedDown\(\)\);[\s\S]{0,160}setInterval\(chk,1000\)/.test(src));
ok('③ start() 가 시계를 맞춘다 (startedAt) — 처음부터 못 받는 경우도 잰다', /start\(\)\{ if\(this\.timer\) return; this\.startedAt=Date\.now\(\);/.test(src));

// ── 행위: 실제 _set · _apply · pull · feedDown 을 뽑아 돌린다 ──────────────────
// 옛 코드(시뮬레이터 있음)에서도 그대로 돌려 **가짜 움직임을 빨강으로 재현**할 수 있게, 있는 블록은 다 싣는다.
const set_src   = grab(/_set\(sym,mid,half,spr,now(,jit)?\)\{[\s\S]*?\n  \},/);
const sim_src   = grab(/_simulate\(\)\{[\s\S]*?\n  \},/);          // 새 코드엔 없어야 한다 (정적 핀 ①)
const apply_src = grab(/_apply\(rows, src\)\{[\s\S]*?\n  \},/);
const pull_src  = grab(/async pull\(\)\{[\s\S]*?\n  \},/);
const down_src  = grab(/feedDown\(\)\{[^\n]*\},/);
const ms_src    = grab(/const FEED_DOWN_MS\s*=\s*\d+;/);
ok('행위 테스트용 소스 블록(_set·_apply·pull·feedDown·FEED_DOWN_MS)을 찾았다', !!(set_src && apply_src && pull_src && down_src && ms_src),
   JSON.stringify({ set: !!set_src, apply: !!apply_src, pull: !!pull_src, down: !!down_src, ms: !!ms_src }));

(async () => {
  if (set_src && apply_src && pull_src) {
    let feed = null;                                   // 테스트가 바꿔 끼우는 서버 응답
    const mk = () => new Function('feedPrices', 'seedSpread', 'halfPx', 'WATCH', 'BASE', 'marketOpen', 'pip',
      (ms_src || 'const FEED_DOWN_MS=5000;') + '\nconst store={ mids:{}, live:false, okAt:0, startedAt:0, failSince:0, notify(){ this.n=(this.n||0)+1; },\n' +
      set_src + '\n' + apply_src + '\n' + sim_src + '\n' + pull_src + '\n' +
      (down_src || 'feedDown(){ return undefined; },') + '\n};\nreturn store;'
    )(async () => feed, () => 1, (sym, mid) => mid * 0.0001,
      ['EURUSD', 'BTCUSD'], { EURUSD: 1.143, BTCUSD: 64250 }, () => true, () => 0.0001);   // 두 시장 다 열려 있는 평일 장중
    const realNow = Date.now; let clock = 1_800_000_000_000; Date.now = () => clock;
    try {
      // A. 처음부터 끊김 — 아무 값도 지어내지 않는다
      const a = mk(); feed = null;
      await a.pull(); clock += 1000; await a.pull(); clock += 1000; await a.pull();
      ok('A. 한 번도 못 받았으면 시세가 없다 (하드코딩 시작가로 채우지 않음)', Object.keys(a.mids).length === 0, JSON.stringify(Object.keys(a.mids)));
      ok('A. live=false', a.live === false);

      // B. 받다가 끊김 — 마지막 값에서 멈춘다
      const b = mk(); feed = [{ symbol: 'EURUSD', mid: 1.1, spr_pts: 1 }, { symbol: 'BTCUSD', mid: 64000, spr_pts: 10 }];
      await b.pull();
      const snap = JSON.stringify([b.mids.EURUSD.mid, b.mids.EURUSD.bid, b.mids.EURUSD.ask, b.mids.BTCUSD.mid, b.mids.BTCUSD.bid, b.mids.BTCUSD.ask]);
      ok('B. 정상 수신: EURUSD 1.1 · BTCUSD 64000 그대로 (bid=mid-half · ask=mid+half, 흔들기 없음)',
         b.mids.EURUSD.mid === 1.1 && b.mids.BTCUSD.mid === 64000 &&
         Math.abs(b.mids.EURUSD.bid - (1.1 - 0.00011)) < 1e-12 && Math.abs(b.mids.EURUSD.ask - (1.1 + 0.00011)) < 1e-12 && b.live === true);
      feed = null;
      for (let i = 0; i < 8; i++) { clock += 1000; await b.pull(); }
      const after = JSON.stringify([b.mids.EURUSD.mid, b.mids.EURUSD.bid, b.mids.EURUSD.ask, b.mids.BTCUSD.mid, b.mids.BTCUSD.bid, b.mids.BTCUSD.ask]);
      ok('B. 8초 끊김 동안 값이 한 틱도 안 움직인다 (열린 크립토 포함)', after === snap, `before ${snap} after ${after}`);
      ok('B. 끊긴 동안 live=false', b.live === false);

      // C. 끊김 표시 — 잠깐(유예 이내)은 조용, 계속되면 켜지고, 돌아오면 꺼진다
      const c = mk(); feed = [{ symbol: 'EURUSD', mid: 1.1, spr_pts: 1 }];
      await c.pull();
      ok('C. 정상일 땐 feedDown()=false', c.feedDown() === false);
      feed = null; clock += 1000; await c.pull();
      ok('C. 한 번 실패(1초)로는 경고 안 띄움 — 깜빡임 방지', c.feedDown() === false);
      clock += 6000; await c.pull();
      ok('C. 마지막으로 받은 지 유예(FEED_DOWN_MS)를 넘기면 feedDown()=true', c.feedDown() === true);
      feed = [{ symbol: 'EURUSD', mid: 1.2, spr_pts: 1 }]; clock += 1000; await c.pull();
      ok('C. 다시 받으면 즉시 feedDown()=false · 새 값 반영', c.feedDown() === false && c.mids.EURUSD.mid === 1.2);

      // D. 요청이 **응답 없이 매달린** 경우 (실제 장애 모양) — pull 이 한 번도 돌아오지 않아도 시간으로 잡는다
      const d = mk(); d.startedAt = clock;                      // start() 가 하는 일
      ok('D. 시작 직후엔 조용 (아직 유예 이내)', d.feedDown() === false);
      clock += 6000;                                            // 그동안 어떤 pull 도 끝나지 않음
      ok('D. 한 번도 못 받은 채 유예를 넘기면 feedDown()=true (실패 응답이 없어도)', d.feedDown() === true);
      const e = mk(); feed = [{ symbol: 'EURUSD', mid: 1.1, spr_pts: 1 }]; e.startedAt = clock; await e.pull();
      clock += 6000;                                            // 받다가, 다음 요청들이 전부 매달림
      ok('D. 받다가 매달려도 마지막 수신 후 유예를 넘기면 feedDown()=true · 값은 그대로', e.feedDown() === true && e.mids.EURUSD.mid === 1.1);
      ok('D. 시작 전(start 안 함)엔 경고 없음', mk().feedDown() === false);
    } finally { Date.now = realNow; }
  }
  console.log(`\n${fail ? '🔴' : '🟢'} webtrade-feed-down — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
