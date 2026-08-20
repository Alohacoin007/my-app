// Alpexa — espn-probe (일회성 진단 · 부작용 0)
// ============================================================================
// 왜 별도 함수인가: 진단 코드를 라이브 피드 함수(sports-games)에 섞으면 ① 핀이 정당하게
// 막고(위장 헤더 금지·붕괴가드 위치) ② 고객 피드를 만드는 경로에 실험 코드가 들어간다.
// 진단은 진단대로 격리한다. 원인이 확정되면 이 함수는 삭제한다.
//
// 무엇을 재는가 (2026-08-20 블랙아웃 3일차):
//   실측된 사실 ①  GitHub 러너(Node) + 헤더 없음  → 200, MLB 632경기
//   실측된 사실 ②  Supabase Edge + 헤더 없음      → 403 (전 리그)
//   두 위치의 차이는 IP 만이 아니다. **Deno 는 헤더를 안 붙여도 `User-Agent: Deno/x.x` 를
//   자동으로 보낸다.** Node 의 fetch 는 UA 를 안 보낸다. 그게 원인이면 UA 한 줄로 끝나고,
//   아니면 진짜 IP 차단이라 릴레이(다른 위치에서 받아 DB 로 넘기기)가 답이다.
//   → UA 를 바꿔가며 재고, 다른 ESPN 호스트도 같이 본다. 결과는 live_games id='diag2'.
//
// 호출: pg_net 으로 1회 (토큰은 기존 cron job 에서 그대로 가져오므로 채팅에 시크릿 없음).
// ============================================================================

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const TIMEOUT_MS = 8000;
const TARGET = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  // 다른 Edge 함수와 같은 fail-closed 규율 — 시크릿 미설정이면 503, 토큰 불일치면 401.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return json({ ok: false, error: "CRON_SECRET not configured (fail-closed)" }, 503);
  if (url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  const out: any[] = [];

  // ① UA 매트릭스 — 같은 URL, UA 만 다르게. 200 이 하나라도 나오면 IP 차단이 아니다.
  const variants: Array<[string, Record<string, string>]> = [
    ["deno-default(헤더없음)", {}],
    ["ua-empty", { "User-Agent": "" }],
    ["ua-curl", { "User-Agent": "curl/8.4.0" }],
    ["ua-node", { "User-Agent": "node" }],
    ["ua-espn", { "User-Agent": "ESPN/1.0" }],
    ["ua-alpexa", { "User-Agent": "alpexa-feed/1.0" }],
    ["accept-only", { "Accept": "application/json" }],
  ];
  for (const [nm, h] of variants) {
    const t0 = Date.now();
    try {
      const res = await fetch(TARGET, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { out.push({ nm, status: res.status, ms: Date.now() - t0 }); continue; }
      const d = await res.json();
      out.push({ nm, status: 200, events: (d.events || []).length, ms: Date.now() - t0 });
    } catch (e) { out.push({ nm, err: String((e as Error).message).slice(0, 60), ms: Date.now() - t0 }); }
  }

  // ② 다른 ESPN 호스트 — WAF 정책이 호스트별로 다를 수 있다. 되는 호스트가 있으면
  //    파싱을 맞추는 건 우리 몫이고, 적어도 릴레이 없이 간다.
  const hosts: Array<[string, string]> = [
    ["cdn.espn.com", "https://cdn.espn.com/core/mlb/scoreboard?xhr=1"],
    ["site.web.api.espn.com", "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=baseball&league=mlb"],
    ["sports.core.api.espn.com", "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events?limit=5"],
  ];
  for (const [nm, u] of hosts) {
    const t0 = Date.now();
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const bytes = res.ok ? (await res.text()).length : 0;
      out.push({ nm, status: res.status, bytes, ms: Date.now() - t0 });
    } catch (e) { out.push({ nm, err: String((e as Error).message).slice(0, 60), ms: Date.now() - t0 }); }
  }

  // 결과를 DB 에 남긴다 — 대시보드 로그를 사람이 뒤지지 않게 (2026-08-19 교훈).
  try {
    await fetch(`${SB_URL}/rest/v1/live_games?on_conflict=id`, {
      method: "POST", headers: { ...H, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "diag2", data: out, updated_at: new Date().toISOString() }),
    });
  } catch (_e) { /* 기록 실패해도 응답에는 실려 나간다 */ }

  return json({ ok: true, probe: out });
});
