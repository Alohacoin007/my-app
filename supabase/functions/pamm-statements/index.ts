// Alpexa — PAMM monthly investor statement (2026-08-06 사장님 "가입 고객에게 월 1회 이메일").
// send-statements 패턴 미러. 스포츠 명세서(server='sports')와 완전 분리 — PAMM 투자자 전용.
// 숫자는 pamm_statement RPC(units×NAV, 서버 산출)에서만 온다. 돈 이동 0 — 순수 스냅샷 메일.
//
// Flow: gate(token) → month(기본=지난달 PDT) → pamm_statement_recipients →
//       각 투자자: pamm_statement → 메일 빌드 → Resend → mark_pamm_statement_sent(멱등).
//
// Secrets: RESEND_API_KEY · CRON_SECRET(또는 WELCOME_SECRET) · SUPABASE_URL/SERVICE_ROLE(런타임 제공).
// 테스트:  ?only=<cust_id>&month=YYYY-MM   한 명만 발송.
// Deploy: supabase functions deploy pamm-statements   (사장님 실행). JWT verify OFF(함수 내 토큰이 관문).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET    = Deno.env.get("CRON_SECRET") || "";
const ALT_SECRET     = Deno.env.get("WELCOME_SECRET") || "";
const SB_URL         = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROM = "Alpexa FX <info@alpexa-sports.com>";
const SITE = "https://alpexa-sports.com";
const MAX_PER_RUN = 300;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function money(n: number): string {
  return "$" + (Math.abs(Number(n) || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function signed(n: number): string {
  const v = Number(n) || 0; return (v < 0 ? "−" : (v > 0 ? "+" : "")) + money(v);
}
function pctStr(r: number): string {
  const v = (Number(r) || 0) * 100; return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}
function monthTitle(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function lastMonthPDT(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

type Fund = { name: string; nav: number; ret: number; basis: number; value: number; pnl: number; month_ops: Array<{ kind: string; usd: number; at: string }> };
type Stmt = { ok?: boolean; total_value?: number; total_basis?: number; funds?: Fund[] };

function buildEmail(name: string, month: string, s: Stmt): string {
  const funds = s.funds || [];
  const totalVal = Number(s.total_value) || 0;
  const totalBasis = Number(s.total_basis) || 0;
  const totalPnl = Math.round((totalVal - totalBasis) * 100) / 100;
  const up = totalPnl >= 0; const accent = up ? "#0a8f2c" : "#c62828";
  const fundRows = funds.map((f) => {
    const pnl = Number(f.pnl) || 0;
    const opsLine = (f.month_ops || []).map((o) =>
      (o.kind === "join" ? "Invested " : "Redeemed ") + money(o.usd)).join(" · ");
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f2;">
      <div style="font-size:14.5px;font-weight:700;color:#1c1c1e;">${esc(f.name)}</div>
      <div style="font-size:12.5px;color:#9b9ba1;margin-top:2px;">Invested ${money(f.basis)} · now <b style="color:#1c1c1e;">${money(f.value)}</b> · <span style="color:${pnl >= 0 ? "#0a8f2c" : "#c62828"};font-weight:700;">${signed(pnl)} (${pctStr(f.ret)})</span></div>
      ${opsLine ? `<div style="font-size:11.5px;color:#aab0bd;margin-top:3px;">${esc(opsLine)} this month</div>` : ""}
    </td></tr>`;
  }).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PAMM Statement</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#fff;">Your ${esc(monthTitle(month))} Alpexa managed-fund statement — value ${money(totalVal)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:8px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;color:#1c1c1e;">
<tr><td style="padding:22px 26px 6px;"><table role="presentation" width="100%"><tr>
  <td align="left"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#1e40d8;vertical-align:middle;margin-right:8px;"></span><span style="font-size:15px;font-weight:800;letter-spacing:-.2px;vertical-align:middle;">Alpexa FX · Managed Funds</span></td>
  <td align="right" style="font-size:13px;font-weight:600;color:#9b9ba1;">${esc(monthTitle(month))}</td>
</tr></table></td></tr>
<tr><td style="padding:24px 26px 4px;">
  <div style="font-size:13px;font-weight:600;color:#9b9ba1;">Total managed value${name ? " · " + esc(name) : ""}</div>
  <div style="font-size:46px;font-weight:800;letter-spacing:-1.6px;line-height:1;margin-top:6px;font-variant-numeric:tabular-nums;">${money(totalVal)}</div>
  <div style="font-size:15px;font-weight:700;margin-top:11px;color:${accent};font-variant-numeric:tabular-nums;">${up ? "▲" : "▼"} ${signed(totalPnl)} <span style="color:#9b9ba1;font-weight:600;">vs invested ${money(totalBasis)}</span></div>
</td></tr>
<tr><td style="padding:18px 26px 4px;">
  <div style="font-size:13px;font-weight:700;margin-bottom:2px;">Your funds</div>
  <table role="presentation" width="100%">${fundRows || `<tr><td style="padding:14px 0;color:#9b9ba1;font-size:13.5px;">No active fund holdings this month.</td></tr>`}</table>
</td></tr>
<tr><td style="padding:20px 26px 6px;" align="center"><a href="${SITE}/webtrade.html?theme=legend" style="display:inline-block;background:#1e40d8;color:#ffffff;font-size:15px;font-weight:800;padding:15px 0;border-radius:999px;width:100%;text-align:center;text-decoration:none;">Open your PAMM dashboard &#8594;</a></td></tr>
<tr><td style="padding:22px 26px 34px;" align="center"><div style="font-size:11.5px;line-height:1.6;color:#9b9ba1;">Values reflect realised fund performance to date; figures reconcile to the fund ledger. Managed-fund statements are sent monthly. Past performance is not indicative of future results — capital at risk.<br>Alpexa FX is a subsidiary of Alpexa Suisse &middot; <a href="mailto:info@alpexa-sports.com" style="color:#9b9ba1;">info@alpexa-sports.com</a></div></td></tr>
</table></td></tr></table></body></html>`;
}

async function rpc(fn: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_SERVICE, "Authorization": `Bearer ${SB_SERVICE}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!CRON_SECRET && !ALT_SECRET) return new Response("gate secret not configured", { status: 503 });
  if (!RESEND_API_KEY || !SB_URL || !SB_SERVICE) return new Response("server not configured", { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-cron-token") || "";
  if (!token || (token !== CRON_SECRET && token !== ALT_SECRET)) return new Response("forbidden", { status: 403 });

  const month = (url.searchParams.get("month") || "").match(/^\d{4}-\d{2}$/) ? url.searchParams.get("month")! : lastMonthPDT();
  const only = url.searchParams.get("only") || "";

  let recips = await rpc("pamm_statement_recipients", { p_month: month }) as Array<{ cust_id: string; name: string; email: string }>;
  if (only) recips = recips.filter((r) => r.cust_id === only);
  recips = recips.slice(0, MAX_PER_RUN);

  let sent = 0; const errors: string[] = [];
  for (const r of recips) {
    try {
      const s = await rpc("pamm_statement", { p_cust: r.cust_id, p_month: month }) as Stmt;
      if (!s || s.ok === false || !(s.funds && s.funds.length)) continue;   // 보유 없으면 스킵
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [r.email], subject: `Your ${monthTitle(month)} managed-fund statement`, html: buildEmail(r.name, month, s) }),
      });
      if (!res.ok) { errors.push(`${r.cust_id}: resend ${res.status}`); continue; }
      await rpc("mark_pamm_statement_sent", { p_cust: r.cust_id, p_month: month, p_email: r.email });
      sent++;
    } catch (e) { errors.push(`${r.cust_id}: ${String((e as Error).message).slice(0, 120)}`); }
  }

  return new Response(JSON.stringify({ ok: true, month, eligible: recips.length, sent, errors: errors.slice(0, 20) }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
