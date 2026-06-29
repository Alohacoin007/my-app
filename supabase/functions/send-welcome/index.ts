// Alpexa — send the signup welcome email via Resend.
//
// Triggered by a Postgres trigger on `players` INSERT (see sql/send_welcome.sql), which calls
// this function with { email, name } and a shared secret. Sends the confirmed A2 template
// from Alpexa Sports <info@alpexa-sports.com>.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   — your Resend API key (same account already used for auth email).
//   WELCOME_SECRET   — a random token; the trigger must pass ?token=<this>. Fail-closed if unset.
//
// Deploy: supabase functions deploy send-welcome   (USER runs this).
// NOTE: sending from info@alpexa-sports.com only works once alpexa-sports.com is VERIFIED in
//       Resend (add the domain there, then add the DKIM/SPF records it shows to Cloudflare DNS).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const WELCOME_SECRET = Deno.env.get("WELCOME_SECRET") || "";
const FROM = "Alpexa Sports <info@alpexa-sports.com>";
const SUBJECT = "Welcome to Alpexa — your account is ready";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function welcomeHtml(name: string): string {
  const first = esc((name || "").trim().split(/\s+/)[0] || "");
  const greet = first ? `, ${first}` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to Alpexa</title>
<style>body{margin:0;padding:0;background:#eceef2;-webkit-text-size-adjust:100%;}a{text-decoration:none;}@media (max-width:480px){.pad{padding-left:24px!important;padding-right:24px!important;}}</style></head>
<body style="margin:0;padding:0;background:#eceef2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eceef2;font-size:1px;line-height:1px;">Your account is ready — your $100 welcome bonus is credited. Here's how to start.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2;"><tr><td align="center" style="padding:24px 0 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.05),0 18px 48px rgba(15,23,42,.11);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;color:#1c1c1e;">
<tr><td style="height:3px;background:#2F54EB;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="pad" style="padding:24px 30px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:30px;height:30px;background:#2F54EB;border-radius:8px;text-align:center;vertical-align:middle;"><span style="font-size:16px;font-weight:800;color:#ffffff;line-height:30px;">A</span></td><td style="padding-left:10px;font-size:15px;font-weight:800;letter-spacing:-.2px;color:#1c1c1e;">Alpexa Sports</td></tr></table></td></tr>
<tr><td class="pad" style="padding:26px 30px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#aab0bd;">Welcome aboard</div><div style="font-size:29px;font-weight:800;letter-spacing:-.6px;color:#11141a;margin-top:10px;line-height:1.15;">Your account is ready${greet}.</div><div style="font-size:14.5px;line-height:1.6;color:#5a6473;margin-top:12px;">Sports betting, crypto and FX — one account, all in USDT. And there's $100 waiting for you.</div></td></tr>
<tr><td class="pad" style="padding:22px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:16px;background:#2742C9;background-image:linear-gradient(135deg,#3B5BDB 0%,#2742C9 60%,#1E33A6 100%);"><tr><td style="padding:20px 22px 22px;"><span style="display:inline-block;background:rgba(255,255,255,.18);border-radius:999px;padding:5px 11px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#ffffff;">&#9679; Ready to play</span><div style="font-size:11.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.68);margin-top:16px;">Welcome bonus</div><div style="font-size:42px;font-weight:800;letter-spacing:-1.8px;color:#ffffff;margin-top:4px;line-height:1;">$100<span style="font-size:16px;font-weight:700;color:rgba(255,255,255,.78);margin-left:7px;letter-spacing:0;">USDT</span></div><div style="font-size:12.5px;color:rgba(255,255,255,.82);margin-top:11px;line-height:1.5;">Credited to your Sports wallet. Your first bet's on us.</div></td></tr></table></td></tr>
<tr><td class="pad" style="padding:18px 30px 0;"><a href="https://alpexa-sports.com/" style="display:block;background:#2F54EB;color:#ffffff;font-size:15px;font-weight:800;padding:16px 0;border-radius:999px;text-align:center;">Place your first bet &#8594;</a><div style="text-align:center;font-size:12px;color:#aab0bd;margin-top:10px;">Takes 30 seconds &middot; no deposit needed to start</div></td></tr>
<tr><td class="pad" style="padding:28px 30px 0;"><div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#aab0bd;margin-bottom:6px;">Get started in 3 steps</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td valign="top" style="width:30px;padding:12px 0;"><div style="width:26px;height:26px;border-radius:50%;border:1.5px solid #d7def0;text-align:center;line-height:24px;font-size:12px;font-weight:800;color:#2F54EB;">1</div></td><td valign="top" style="padding:12px 0 12px 13px;border-bottom:1px solid #f1f2f5;"><div style="font-size:14px;font-weight:800;color:#11141a;">Pick a match</div><div style="font-size:12.5px;color:#7a828f;margin-top:2px;">NFL, NBA, MLB, soccer — pre-game or live.</div></td></tr>
<tr><td valign="top" style="width:30px;padding:12px 0;"><div style="width:26px;height:26px;border-radius:50%;border:1.5px solid #d7def0;text-align:center;line-height:24px;font-size:12px;font-weight:800;color:#2F54EB;">2</div></td><td valign="top" style="padding:12px 0 12px 13px;border-bottom:1px solid #f1f2f5;"><div style="font-size:14px;font-weight:800;color:#11141a;">Place your bet</div><div style="font-size:12.5px;color:#7a828f;margin-top:2px;">Use your $100 bonus — singles, parlays, same-game.</div></td></tr>
<tr><td valign="top" style="width:30px;padding:12px 0;"><div style="width:26px;height:26px;border-radius:50%;border:1.5px solid #d7def0;text-align:center;line-height:24px;font-size:12px;font-weight:800;color:#2F54EB;">3</div></td><td valign="top" style="padding:12px 0 12px 13px;"><div style="font-size:14px;font-weight:800;color:#11141a;">Cash out in USDT</div><div style="font-size:12.5px;color:#7a828f;margin-top:2px;">Withdraw winnings to your crypto wallet, anytime.</div></td></tr>
</table></td></tr>
<tr><td class="pad" style="padding:18px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fc;border-radius:12px;"><tr><td style="padding:13px 16px;font-size:12.5px;color:#5a6473;line-height:1.6;">Questions? Reply to this email or write to <a href="mailto:info@alpexa-sports.com" style="color:#2F54EB;font-weight:700;">info@alpexa-sports.com</a>.</td></tr></table></td></tr>
<tr><td class="pad" style="padding:22px 30px 28px;"><div style="border-top:1px solid #eceef2;padding-top:16px;"><div style="font-size:11px;color:#9b9ba1;line-height:1.6;">The welcome bonus must be wagered before withdrawal. Bet responsibly — 18+.</div><div style="font-size:11px;color:#9b9ba1;line-height:1.6;margin-top:8px;">Alpexa Sports is a subsidiary of Alpexa Suisse &middot; <a href="mailto:info@alpexa-sports.com" style="color:#9b9ba1;text-decoration:underline;">info@alpexa-sports.com</a></div><div style="font-size:11px;color:#bcbcc2;margin-top:8px;">You're receiving this because you created an Alpexa account.</div></div></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Fail-closed: no secret configured → refuse (never world-callable to send mail).
  if (!WELCOME_SECRET) return new Response("welcome secret not configured", { status: 503 });
  if (!RESEND_API_KEY) return new Response("resend key not configured", { status: 503 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-welcome-token") || "";
  if (token !== WELCOME_SECRET) return new Response("forbidden", { status: 403 });

  let body: { email?: string; name?: string } = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: "bad email" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], subject: SUBJECT, html: welcomeHtml(name) }),
  });
  const out = await res.text();
  return new Response(JSON.stringify({ ok: res.ok, status: res.status, resend: out }), {
    status: res.ok ? 200 : 502, headers: { "content-type": "application/json" },
  });
});
