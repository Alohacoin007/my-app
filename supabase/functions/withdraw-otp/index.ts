// Alpexa — withdraw-otp: email a 6-digit withdrawal verification code (Resend).
// ============================================================================
// The crypto app calls this (with the signed-in user's JWT) before a $1,000+
// external withdrawal. We:
//   1) identify the caller from their JWT (never trust a client-supplied email),
//   2) generate a 6-digit code, store its SHA-256 HASH in public.withdraw_otp
//      (service role) with a 10-min expiry,
//   3) email the CODE to the account's REGISTERED email via Resend.
// The user then enters it → verify_withdraw_otp() RPC opens the unlock window the
// withdraw guard checks. The code itself is never stored, only its hash.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Alpexa <info@alpexa-sports.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function otpHtml(code: string): string {
  const spaced = esc(code).split("").join("&nbsp;&nbsp;");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eceef2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2;"><tr><td align="center" style="padding:24px 0 44px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fff;border-radius:18px;overflow:hidden;font-family:-apple-system,Segoe UI,Inter,system-ui,sans-serif;color:#1c1c1e;box-shadow:0 18px 48px rgba(15,23,42,.11);">
<tr><td style="height:3px;background:#2F54EB;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:26px 30px 0;"><div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#aab0bd;">Withdrawal verification</div>
<div style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:#11141a;margin-top:10px;">Confirm your withdrawal</div>
<div style="font-size:14px;line-height:1.6;color:#5a6473;margin-top:12px;">Enter this code in the app to authorize your crypto withdrawal. It expires in 10 minutes.</div></td></tr>
<tr><td style="padding:22px 30px 6px;text-align:center;"><div style="display:inline-block;background:#f4f7fe;border:1px solid #dbe4fb;border-radius:14px;padding:18px 26px;font-size:34px;font-weight:800;letter-spacing:8px;color:#11141a;font-family:Menlo,Consolas,monospace;">${spaced}</div></td></tr>
<tr><td style="padding:16px 30px 28px;"><div style="font-size:12px;color:#9b9ba1;line-height:1.6;">If you didn't request this, someone may have your password — do not share this code, and change your password. Alpexa will never ask you for it.</div></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SERVICE_KEY || !ANON_KEY) return json({ ok: false, error: "server not configured" }, 503);
  if (!RESEND_API_KEY) return json({ ok: false, error: "email not configured" }, 503);

  // Identify the caller from THEIR JWT (never a client-supplied email).
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ ok: false, error: "not authenticated" }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: ud, error: uerr } = await asUser.auth.getUser();
  if (uerr || !ud || !ud.user) return json({ ok: false, error: "not authenticated" }, 401);
  const uid = ud.user.id;
  const email = String(ud.user.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "no email on file" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: pl } = await admin.from("players").select("cust_id").eq("auth_id", uid).limit(1).maybeSingle();
  const cust = pl && pl.cust_id ? String(pl.cust_id) : "";
  if (!cust) return json({ ok: false, error: "no account" }, 400);

  // 6-digit code (crypto-random), store only its hash.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = String(n).padStart(6, "0");
  const code_hash = await sha256hex(code);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: werr } = await admin.from("withdraw_otp").upsert(
    { cust_id: cust, code_hash, expires_at, attempts: 0, unlocked_until: null, updated_at: new Date().toISOString() },
    { onConflict: "cust_id" },
  );
  if (werr) return json({ ok: false, error: "could not create code" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], subject: `${code} is your Alpexa withdrawal code`, html: otpHtml(code) }),
  });
  if (!res.ok) return json({ ok: false, error: "could not send email" }, 502);

  // Mask the email in the response so the app can say "sent to j•••@gmail.com".
  const masked = email.replace(/^(.)(.*)(@.*)$/, (_m, a, mid, dom) => a + "•".repeat(Math.max(1, mid.length)) + dom);
  return json({ ok: true, sentTo: masked });
});
