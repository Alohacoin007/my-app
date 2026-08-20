#!/usr/bin/env node
// Alpexa — ESPN 전송 경로 프로브 (2026-08-20 블랙아웃)
// ============================================================================
// 왜 이게 있나: 2026-08-19 스포츠 피드가 441경기 → 2경기로 붕괴했다. 원인은 코드가 아니라
// **전송(transport)** 이었다 — Supabase Edge 에서 site.api.espn.com 이 전 리그 **403**.
// (증거: live_games id='diag' 행. 직접 403 · corsproxy.io 403 · allorigins 520.)
// 같은 URL 이 사장님 브라우저에서는 정상 JSON 을 준다 = ESPN 이 데이터센터 IP 를 막는 것.
//
// 이 스크립트는 **어디서 실행되든** 그 자리에서 ESPN 이 닿는지를 실측한다. GitHub Actions
// 러너(= 릴레이 후보 IP)에서 돌리면 "릴레이가 성립하는가"에 대한 증거가 나온다. 추측 금지 —
// 릴레이를 설계하기 전에 러너가 ESPN 을 볼 수 있는지부터 눈으로 본다.
//
// 실행: node tests/espn-transport-probe.js
// 종료코드: 직접 경로가 하나라도 200+events>0 이면 0, 아니면 1 (릴레이 불가 = 빨강).
// 부작용 0 — 읽기만 한다. 돈·DB 접근 없음.
// ============================================================================

const p2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
const RANGE = `${ymd(new Date(Date.now() - 7 * 86400000))}-${ymd(new Date(Date.now() + 45 * 86400000))}`;

// 대표 3리그면 충분 — 전 리그가 같은 호스트를 쓴다.
const PATHS = ['baseball/mlb', 'football/nfl', 'soccer/eng.1'];

const BROWSERISH = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
};

// 전송 후보. 파싱이 바뀌지 않는 것(원본 바디를 그대로 돌려주는 프록시)만 후보로 둔다 —
// 응답 모양이 다르면 그건 전송이 아니라 새 데이터소스이고, gid 규약이 깨진다.
function transports(path) {
  const direct = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${RANGE}&limit=1000`;
  const enc = encodeURIComponent(direct);
  return [
    { nm: 'direct(헤더없음)', url: direct, headers: {} },
    { nm: 'direct(브라우저헤더)', url: direct, headers: BROWSERISH },
    { nm: 'corsproxy.io', url: `https://corsproxy.io/?url=${enc}`, headers: BROWSERISH },
    { nm: 'allorigins', url: `https://api.allorigins.win/raw?url=${enc}`, headers: BROWSERISH },
    { nm: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${enc}`, headers: {} },
    { nm: 'cors.workers.dev', url: `https://test.cors.workers.dev/?${direct}`, headers: {} },
  ];
}

async function probe(t) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(t.url, { headers: t.headers, signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ...t, status: res.status, ms: Date.now() - t0 };
    const txt = await res.text();
    let events = null;
    try { events = (JSON.parse(txt).events || []).length; } catch (_e) { /* JSON 아님 */ }
    return { ...t, status: 200, events, bytes: txt.length, ms: Date.now() - t0 };
  } catch (e) {
    return { ...t, err: String(e && e.message).slice(0, 80), ms: Date.now() - t0 };
  }
}

(async () => {
  console.log('🛰️  ESPN 전송 프로브 — 이 실행 위치에서 ESPN 이 닿는지 실측');
  console.log(`   범위 dates=${RANGE}\n`);
  let anyDirect = false;
  const rows = [];
  for (const path of PATHS) {
    for (const t of transports(path)) {
      const r = await probe(t);
      rows.push({ path, ...r });
      const verdict = r.status === 200 && r.events > 0 ? '🟢' : (r.status === 200 ? '🟡' : '🔴');
      const detail = r.err ? `err=${r.err}` : `status=${r.status}${r.events != null ? ` events=${r.events}` : ` (JSON 아님, ${r.bytes}B)`}`;
      console.log(`${verdict} ${path.padEnd(16)} ${r.nm.padEnd(22)} ${detail}  ${r.ms}ms`);
      if (r.status === 200 && r.events > 0 && r.nm.startsWith('direct')) anyDirect = true;
    }
    console.log('');
  }
  const ok = rows.filter((r) => r.status === 200 && r.events > 0);
  console.log('─'.repeat(70));
  if (!ok.length) {
    console.log('🔴 이 위치에서는 어떤 경로로도 ESPN 경기를 못 받는다 → 릴레이 후보에서 탈락.');
    process.exit(1);
  }
  const byT = {};
  ok.forEach((r) => { byT[r.nm] = (byT[r.nm] || 0) + 1; });
  console.log('🟢 살아있는 경로: ' + Object.keys(byT).map((k) => `${k}(${byT[k]}/${PATHS.length})`).join(' · '));
  console.log(anyDirect ? '   → 직접 호출이 되는 위치다. 여기서 받아 DB 로 릴레이하면 된다.'
                        : '   → 직접은 막혔고 프록시만 산다. 프록시 의존은 취약 — 다른 위치를 더 찾는다.');
  process.exit(anyDirect ? 0 : 1);
})();
