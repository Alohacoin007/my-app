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

function usd(n: unknown): string { return "$" + (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
// deno-lint-ignore no-explicit-any
function reportEmail(r: any, liab: any, pnl: any): string {
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

  // 💰 손익 (P&L)
  let pnlHtml = "";
  if (pnl && pnl.ok) {
    pnlHtml = `<h3 style="margin:18px 0 4px;">💰 손익 (최근 7일)</h3>
      <div style="font-size:14px;color:#333;">Handle <b>${usd(pnl.handle)}</b> · 지급 ${usd(pnl.payouts)} · GGR <b>${usd(pnl.ggr)}</b>
      · Hold <b style="color:${(pnl.hold_pct >= 0 ? "#1a7f37" : "#c0392b")};">${pnl.hold_pct}%</b>
      <span style="color:#999;">(베팅 ${pnl.bets} · 당첨 ${pnl.won ?? "—"} · 패 ${pnl.lost ?? "—"})</span></div>`;
  }
  // 📊 노출 (Liability) — top 5 by payout
  let liabHtml = "";
  if (liab && liab.ok) {
    const top = (liab.by_event_pick || []).slice(0, 5).map((e: any) =>
      `<tr><td style="padding:5px 12px;border-bottom:1px solid #eee;">${e.game || e.gid}</td>`
      + `<td style="padding:5px 12px;border-bottom:1px solid #eee;">${e.pick || ""}</td>`
      + `<td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;">${usd(e.stake)}</td>`
      + `<td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${usd(e.payout_if_wins)}</td>`
      + `<td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;color:#c0392b;">${usd(e.net_liability)}</td></tr>`).join("");
    liabHtml = `<h3 style="margin:18px 0 4px;">📊 노출 (현재 미정산)</h3>
      <div style="font-size:13px;color:#666;margin-bottom:6px;">미정산 ${liab.open_bets}건 · 최대 단건 지급 <b>${usd(liab.biggest_single_payout)}</b></div>
      ${top ? `<table style="border-collapse:collapse;width:100%;font-size:13px;"><tr style="background:#f6f7f9;">
        <th style="padding:5px 12px;text-align:left;">경기</th><th style="padding:5px 12px;text-align:left;">픽</th>
        <th style="padding:5px 12px;text-align:right;">받음</th><th style="padding:5px 12px;text-align:right;">지급</th><th style="padding:5px 12px;text-align:right;">순노출</th></tr>${top}</table>` : ""}`;
  }

  return `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;">
    <h2 style="margin:0 0 4px;">🏈 스포츠 일일 디지털</h2>
    <div style="color:#666;margin-bottom:12px;">감사: <b>${verdictTxt}</b> · 🔴 ${r.red} · 🟡 ${r.yellow}</div>
    ${pnlHtml}${liabHtml}
    <h3 style="margin:18px 0 4px;">🔎 감사 체크</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px;"><tr style="background:#f6f7f9;">
      <th style="padding:6px 12px;text-align:left;">체크</th><th style="padding:6px 12px;text-align:left;">항목</th>
      <th style="padding:6px 12px;">결과</th><th style="padding:6px 12px;text-align:right;">건수</th><th style="padding:6px 12px;text-align:left;">비고</th></tr>
      ${rows}</table>
    <div style="color:#999;font-size:12px;margin-top:12px;">🔴=돈 사고 가능 · ⚠️=컬럼 대조 필요 · Hold%는 업계 5~8% 정상 · 상세는 audit_reports.</div></div>`;
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

  // Command-center digest: pull liability + P&L alongside the audit (best-effort).
  // deno-lint-ignore no-explicit-any
  let liab: any = null, pnl: any = null;
  try { liab = await rpc("sports_liability", {}); } catch (_) { /* optional */ }
  try { pnl  = await rpc("sports_pnl", {}); } catch (_) { /* optional */ }

  // Send the daily digest (audit + 노출 + hold%) every run. The subject is itself a one-line
  // dashboard. (Red/yellow stand out; a green day is a quick "all clear + today's numbers".)
  let emailed = false;
  if (RESEND_API_KEY) {
    const vdot = r.verdict === "red" ? "🔴" : r.verdict === "yellow" ? "🟡" : "🟢";
    const subj = `🏈 일일 디지털 ${vdot} · hold ${pnl?.hold_pct ?? "—"}% · 노출 ${usd(liab?.biggest_single_payout)}`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [ALERT_TO], subject: subj, html: reportEmail(r, liab, pnl) }),
      });
      emailed = res.ok;
    } catch (_) { /* email failure shouldn't fail the audit */ }
  }
  return new Response(JSON.stringify({ ok: true, verdict: r?.verdict, red: r?.red, yellow: r?.yellow,
    hold_pct: pnl?.hold_pct, biggest_exposure: liab?.biggest_single_payout, open_bets: liab?.open_bets, emailed }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
