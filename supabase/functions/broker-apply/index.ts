// Alpexa — broker-apply
// Public endpoint for the Introducing-Broker application form
// (site/introducing-broker.html). Does the privileged work the static page can't:
//   1) validate name + email server-side,
//   2) store the application in public.broker_applications (service_role, RLS-locked),
//   3) email a notification to the back office (Resend), reply-to = applicant.
//
// PUBLIC: this is called by an unauthenticated browser, so deploy with **Verify JWT OFF**.
// A hidden honeypot field (`company`) silently drops bots. No money, no secrets returned.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), RESEND_API_KEY.

const SB_URL     = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Alpexa Sports <info@alpexa-sports.com>";
const NOTIFY_TO = Deno.env.get("BROKER_NOTIFY_EMAIL") || "info@alpexa-sports.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "server not configured" }, 503);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch (_) { return json({ ok: false, error: "bad json" }, 400); }

  // Honeypot: real users never fill `company`. Bots do → accept silently, store nothing.
  if (body.company && String(body.company).trim()) return json({ ok: true });

  const fullName = String(body.name || "").trim().slice(0, 200);
  const email    = String(body.email || "").trim().slice(0, 200);
  const notes    = String(body.notes || "").trim().slice(0, 4000);
  if (!fullName)            return json({ ok: false, error: "name required" }, 422);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "valid email required" }, 422);

  const ua = (req.headers.get("user-agent") || "").slice(0, 400);

  // 1) Store (service_role → bypasses the table's RLS lock). Storage is the source of
  //    truth; a failed insert is a real failure (don't pretend success).
  const insRes = await fetch(`${SB_URL}/rest/v1/broker_applications`, {
    method: "POST",
    headers: { "apikey": SB_SERVICE, "Authorization": `Bearer ${SB_SERVICE}`,
               "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ full_name: fullName, email, notes: notes || null,
                           source: "introducing-broker", user_agent: ua }),
  });
  if (!insRes.ok) {
    return json({ ok: false, error: "store failed " + insRes.status }, 502);
  }

  // 2) Notify the back office (best-effort — the application is already safely stored,
  //    so an email hiccup must NOT fail the request).
  let emailed = false;
  if (RESEND_API_KEY) {
    const html = `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;">
      <h2 style="margin:0 0 6px;">🤝 새 브로커 신청</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-top:8px;">
        <tr><td style="padding:4px 12px;color:#888;">이름</td><td style="padding:4px 12px;"><b>${esc(fullName)}</b></td></tr>
        <tr><td style="padding:4px 12px;color:#888;">이메일</td><td style="padding:4px 12px;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td style="padding:4px 12px;color:#888;vertical-align:top;">메모</td><td style="padding:4px 12px;white-space:pre-wrap;">${notes ? esc(notes) : "<span style='color:#aaa;'>(없음)</span>"}</td></tr>
      </table>
      <div style="color:#999;font-size:12px;margin-top:12px;">출처: introducing-broker · broker_applications 테이블에 저장됨. 답장하면 신청자에게 바로 갑니다.</div></div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [NOTIFY_TO], reply_to: email,
                               subject: `🤝 새 브로커 신청 — ${fullName}`, html }),
      });
      emailed = r.ok;
    } catch (_) { /* stored already; ignore email failure */ }
  }

  return json({ ok: true, stored: true, emailed });
});
