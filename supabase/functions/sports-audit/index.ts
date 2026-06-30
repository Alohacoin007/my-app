// Alpexa — daily sports operations audit (spec: 스포츠-마스터-감사.md).
// Calls run_sports_audit() (which runs C1~C9 and records a row in audit_reports), and emails
// an alert when the verdict is RED/YELLOW. Pure read/record — moves no money.
//
// Secrets: RESEND_API_KEY, CRON_SECRET (or WELCOME_SECRET) as the gate token,
//          SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto). Fail-closed.
// Trigger (test): ?token=<secret>     Deploy: supabase functions deploy sports-audit (USER).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET    = Deno.env.get("CRON_SECRET") || "";
const ALT_SECRET     = Deno.env.get("WELCOME_SECRET") || "";
const SB_URL         = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROM = "Alpexa Sports <info@alpexa-sports.com>";
const ALERT_TO = Deno.env.get("AUDIT_ALERT_EMAIL") || "info@alpexa-sports.com";

async function rpc(fn: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_SERVICE, "Authorization": `Bearer ${SB_SERVICE}` },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// deno-lint-ignore no-explicit-any
function reportEmail(r: any): string {
  const dot = (s: string) => s === "red" ? "🔴" : s === "yellow" ? "🟡" : s === "error" ? "⚠️" : "🟢";
  const rep = r.report || {};
  const rows = Object.keys(rep).sort().map((k) => {
    const c = rep[k];
    return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-family:monospace;">${k}</td>`
      + `<td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.label || ""}</td>`
      + `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${dot(c.sev)}</td>`
      + `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${c.count}</td>`
      + `<td style="padding:6px 12px;border-bottom:1px solid #eee;color:#999;font-size:12px;">${c.err ? "ERR: " + String(c.err).slice(0, 80) : (c.note || "")}</td></tr>`;
  }).join("");
  const verdictTxt = r.verdict === "red" ? "🔴 조치 필요" : r.verdict === "yellow" ? "🟡 주의" : "🟢 ALL CLEAR";
  return `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;">
    <h2 style="margin:0 0 4px;">🏈 스포츠 일일 감사</h2>
    <div style="color:#666;margin-bottom:12px;">판정: <b>${verdictTxt}</b> · 🔴 ${r.red} · 🟡 ${r.yellow}</div>
    <table style="border-collapse:collapse;width:100%;font-size:14px;"><tr style="background:#f6f7f9;">
      <th style="padding:6px 12px;text-align:left;">체크</th><th style="padding:6px 12px;text-align:left;">항목</th>
      <th style="padding:6px 12px;">결과</th><th style="padding:6px 12px;text-align:right;">건수</th><th style="padding:6px 12px;text-align:left;">비고</th></tr>
      ${rows}</table>
    <div style="color:#999;font-size:12px;margin-top:12px;">🔴=돈 사고 가능, 즉시 조치 · ⚠️=쿼리 컬럼 대조 필요 · 상세는 audit_reports 테이블.</div></div>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!CRON_SECRET && !ALT_SECRET) return new Response("gate secret not configured", { status: 503 });
  if (!SB_URL || !SB_SERVICE) return new Response("server not configured", { status: 503 });
  const token = new URL(req.url).searchParams.get("token") || req.headers.get("x-cron-token") || "";
  if (!token || (token !== CRON_SECRET && token !== ALT_SECRET)) return new Response("forbidden", { status: 403 });

  // deno-lint-ignore no-explicit-any
  let r: any;
  try { r = await rpc("run_sports_audit", {}); }
  catch (e) { return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 502, headers: { "content-type": "application/json" } }); }

  // Alert by email when not all-clear (and we have a key). Green days stay quiet.
  let emailed = false;
  if (RESEND_API_KEY && r && r.verdict && r.verdict !== "green") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [ALERT_TO], subject: `🏈 스포츠 감사 ${r.verdict === "red" ? "🔴 조치필요" : "🟡 주의"} — 🔴${r.red} 🟡${r.yellow}`, html: reportEmail(r) }),
      });
      emailed = res.ok;
    } catch (_) { /* alert failure shouldn't fail the audit */ }
  }
  return new Response(JSON.stringify({ ok: true, verdict: r?.verdict, red: r?.red, yellow: r?.yellow, emailed }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
