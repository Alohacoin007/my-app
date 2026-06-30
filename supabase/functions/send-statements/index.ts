// Alpexa — monthly statement email (step 3). Sends each eligible sports account its monthly
// statement via Resend. Numbers come ONLY from the get_statement RPC (ties to the ledger).
//
// Flow: gate(token) → resolve month (default = last month, PDT) → list_statement_recipients →
//       for each: get_statement → build email → Resend → mark_statement_sent (idempotent).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  — same key used by send-welcome.
//   CRON_SECRET     — gate token; the monthly pg_cron passes ?token=<CRON_SECRET>. Fail-closed.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided by the Edge runtime (service role
//                     lets us call the SECURITY DEFINER RPCs above; never shipped to a client).
//
// Test before the real run:  ?only=<acct_no>&month=YYYY-MM   sends just that one account.
// Deploy: supabase functions deploy send-statements   (USER runs this).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET    = Deno.env.get("CRON_SECRET") || "";
const SB_URL         = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FROM = "Alpexa Sports <info@alpexa-sports.com>";
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
function monthTitle(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dayLabel(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }); } catch { return ""; }
}
// Previous calendar month in Las Vegas time, as 'YYYY-MM'.
function lastMonthPDT(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

const KIND: Record<string, string> = {
  bonus: "Welcome bonus", crypto: "Crypto", transfer: "Transfers", withdraw: "Withdrawal",
  withdraw_hold: "Withdrawal", bet: "Bets staked", bet_won: "Winnings & returns", win: "Winnings",
  fx: "FX trade", fx_close: "FX close", swap: "Swap", stake: "Staking", unstake: "Unstaking",
  bet_cashout: "Cash out", bet_void: "Bet void", admin_adjust: "Adjustment", deposit: "Deposit",
};
function kindLabel(k: string): string {
  return KIND[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") : "Other");
}
// Map by_kind → the four statement buckets (same as the web page; sums reconcile to net).
function buckets(by_kind: Array<{ kind: string; total: number }>): Record<string, number> {
  const b = { deposits: 0, withdrawals: 0, bets: 0, winnings: 0, other: 0 };
  for (const k of (by_kind || [])) {
    const t = Number(k.total) || 0;
    if (k.kind === "bet") b.bets += t;
    else if (k.kind === "bet_won" || k.kind === "betpay" || k.kind === "win") b.winnings += t;
    else if (k.kind === "withdraw" || k.kind === "withdraw_hold") b.withdrawals += t;
    else if (["deposit", "crypto", "transfer", "bonus"].includes(k.kind)) b.deposits += t;
    else b.other += t;
  }
  return b;
}

// deno-lint-ignore no-explicit-any
function buildEmail(name: string, month: string, s: any): string {
  const first = esc((name || "").trim().split(/\s+/)[0] || "");
  const up = (Number(s.net_change) || 0) >= 0;
  const accent = up ? "#2F54EB" : "#FF5000";
  const b = buckets(s.by_kind || []);
  const sumRow = (label: string, val: number) =>
    `<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f2;color:#9b9ba1;font-size:14.5px;">${label}</td>` +
    `<td align="right" style="padding:12px 0;border-bottom:1px solid #f0f0f2;font-weight:600;color:#1c1c1e;font-size:14.5px;font-variant-numeric:tabular-nums;">${signed(val)}</td></tr>`;
  const rows: string[] = [];
  if (Math.abs(b.deposits) >= 0.005) rows.push(sumRow("Deposits", b.deposits));
  if (Math.abs(b.winnings) >= 0.005) rows.push(sumRow("Winnings &amp; returns", b.winnings));
  if (Math.abs(b.bets) >= 0.005) rows.push(sumRow("Bets staked", b.bets));
  if (Math.abs(b.withdrawals) >= 0.005) rows.push(sumRow("Withdrawals", b.withdrawals));
  if (Math.abs(b.other) >= 0.005) rows.push(sumRow("Other", b.other));

  const tx = (s.tx || []).slice(0, 6).map((t: { at: string; kind: string; amount: number }) => {
    const pos = (Number(t.amount) || 0) >= 0;
    return `<tr><td style="padding:11px 0;border-bottom:1px solid #f0f0f2;"><div style="font-size:14px;font-weight:700;color:#1c1c1e;">${esc(kindLabel(t.kind))}</div>` +
      `<div style="font-size:12px;color:#9b9ba1;margin-top:1px;">${esc(dayLabel(t.at))}</div></td>` +
      `<td align="right" style="padding:11px 0;border-bottom:1px solid #f0f0f2;font-size:14.5px;font-weight:700;color:${pos ? "#2F54EB" : "#1c1c1e"};font-variant-numeric:tabular-nums;">${signed(t.amount)}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Statement</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#fff;">Your ${esc(monthTitle(month))} Alpexa statement — closing value ${money(s.closing)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:8px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;color:#1c1c1e;">
<tr><td style="padding:22px 26px 6px;"><table role="presentation" width="100%"><tr>
  <td align="left"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#2F54EB;vertical-align:middle;margin-right:8px;"></span><span style="font-size:15px;font-weight:800;letter-spacing:-.2px;vertical-align:middle;">Alpexa Sports</span></td>
  <td align="right" style="font-size:13px;font-weight:600;color:#9b9ba1;">${esc(monthTitle(month))}</td>
</tr></table></td></tr>
<tr><td style="padding:24px 26px 4px;">
  <div style="font-size:13px;font-weight:600;color:#9b9ba1;">Account value${first ? " · " + first : ""}</div>
  <div style="font-size:48px;font-weight:800;letter-spacing:-1.8px;line-height:1;margin-top:6px;font-variant-numeric:tabular-nums;">${money(s.closing)}</div>
  <div style="font-size:15px;font-weight:700;margin-top:11px;color:${accent};font-variant-numeric:tabular-nums;">${up ? "▲" : "▼"} ${signed(s.net_change)} <span style="color:#9b9ba1;font-weight:600;">${esc(monthTitle(month).split(" ")[0])}</span></div>
</td></tr>
<tr><td style="padding:18px 26px 4px;">
  <div style="font-size:13px;font-weight:700;margin-bottom:2px;">This month</div>
  <table role="presentation" width="100%">${rows.join("")}
    <tr><td style="padding:14px 0;font-weight:700;">Net change</td><td align="right" style="padding:14px 0;font-weight:800;color:${accent};font-variant-numeric:tabular-nums;">${signed(s.net_change)}</td></tr>
  </table>
  <div style="display:flex;justify-content:space-between;font-size:12px;color:#9b9ba1;margin-top:2px;"><span>Opening ${money(s.opening)}</span><span>Closing ${money(s.closing)}</span></div>
</td></tr>
${tx ? `<tr><td style="padding:22px 26px 0;"><div style="font-size:13px;font-weight:700;margin-bottom:2px;">Recent activity</div><table role="presentation" width="100%">${tx}</table>
  <div style="font-size:12px;color:#9b9ba1;margin-top:12px;text-align:center;">Showing recent activity — the full month is on your statement page.</div></td></tr>` : ""}
<tr><td style="padding:20px 26px 6px;" align="center"><a href="${SITE}/statement.html?m=${esc(month)}" style="display:inline-block;background:#2F54EB;color:#ffffff;font-size:15px;font-weight:800;padding:15px 0;border-radius:999px;width:100%;text-align:center;text-decoration:none;">View full statement &#8594;</a></td></tr>
<tr><td style="padding:22px 26px 34px;" align="center"><div style="font-size:11.5px;line-height:1.6;color:#9b9ba1;">For your records — figures reconcile to your account ledger. Statements are sent monthly.<br>Alpexa Sports is a subsidiary of Alpexa Suisse &middot; <a href="mailto:info@alpexa-sports.com" style="color:#9b9ba1;">info@alpexa-sports.com</a></div></td></tr>
</table></td></tr></table></body></html>`;
}

async function rpc(fn: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SB_SERVICE, "Authorization": `Bearer ${SB_SERVICE}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (!CRON_SECRET) return new Response("gate secret not configured", { status: 503 });
  if (!RESEND_API_KEY || !SB_URL || !SB_SERVICE) return new Response("server not configured", { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-cron-token") || "";
  if (token !== CRON_SECRET) return new Response("forbidden", { status: 403 });

  const month = (url.searchParams.get("month") || "").match(/^\d{4}-\d{2}$/) ? url.searchParams.get("month")! : lastMonthPDT();
  const only = url.searchParams.get("only") || "";

  let recips = await rpc("list_statement_recipients", { p_month: month }) as Array<{ acct_no: string; name: string; email: string }>;
  if (only) recips = recips.filter((r) => r.acct_no === only);
  recips = recips.slice(0, MAX_PER_RUN);

  let sent = 0; const errors: string[] = [];
  for (const r of recips) {
    try {
      const s = await rpc("get_statement", { p_acct: r.acct_no, p_month: month }) as { ok?: boolean };
      if (!s || s.ok === false) { errors.push(`${r.acct_no}: statement ${JSON.stringify(s)}`); continue; }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [r.email], subject: `Your ${monthTitle(month)} statement is ready`, html: buildEmail(r.name, month, s) }),
      });
      if (!res.ok) { errors.push(`${r.acct_no}: resend ${res.status}`); continue; }
      await rpc("mark_statement_sent", { p_acct: r.acct_no, p_month: month, p_email: r.email });
      sent++;
    } catch (e) { errors.push(`${r.acct_no}: ${String((e as Error).message).slice(0, 120)}`); }
  }

  return new Response(JSON.stringify({ ok: true, month, eligible: recips.length, sent, errors: errors.slice(0, 20) }), {
    status: 200, headers: { "content-type": "application/json" },
  });
});
