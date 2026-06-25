// Alpexa — transak-widget (server-side Transak Secure Widget URL generator)
//
// Transak now REQUIRES the widget URL to be created server-side (the api-secret must
// never reach the client). Flow:
//   1) POST /partners/api/v2/refresh-token  (header api-secret)      -> access token
//   2) POST /api/v2/auth/session            (header access-token)    -> { widgetUrl }
// The client calls this function, gets widgetUrl, and opens it. sessionId is single-use
// and the URL is valid ~5 minutes.
//
// Set these in Supabase → Project Settings → Edge Functions → Secrets:
//   TRANSAK_API_KEY     (public partner key)
//   TRANSAK_API_SECRET  (secret — NEVER expose client-side)
//   TRANSAK_ENV         'staging' | 'production'   (default 'staging')

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const ENV = (Deno.env.get("TRANSAK_ENV") || "staging").toLowerCase();
const IS_PROD = ENV === "production";
const AUTH_BASE = IS_PROD ? "https://api.transak.com"        : "https://api-stg.transak.com";
const GW_BASE   = IS_PROD ? "https://api-gateway.transak.com" : "https://api-gateway-stg.transak.com";

async function getAccessToken(apiKey: string, apiSecret: string): Promise<string> {
  const r = await fetch(`${AUTH_BASE}/partners/api/v2/refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-secret": apiSecret },
    body: JSON.stringify({ apiKey }),
  });
  const d = await r.json().catch(() => ({}));
  const token = d?.data?.accessToken || d?.accessToken;
  if (!token) throw new Error("refresh-token failed: " + JSON.stringify(d).slice(0, 300));
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("TRANSAK_API_KEY");
    const apiSecret = Deno.env.get("TRANSAK_API_SECRET");
    if (!apiKey || !apiSecret) return json({ ok: false, error: "TRANSAK_API_KEY / TRANSAK_API_SECRET not set" }, 500);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const fiatAmount = +body.amount || 0;
    const walletAddress = String(body.walletAddress || "");
    const referrerDomain = String(body.referrerDomain || "alpexa-sports.com");
    const partnerOrderId = String(body.partnerOrderId || ("dep-" + Date.now()));
    const partnerCustomerId = String(body.partnerCustomerId || "");
    const email = String(body.email || "");
    const network = String(body.network || "ethereum");
    const cryptoCurrencyCode = String(body.cryptoCurrencyCode || "USDT");
    const fiatCurrency = String(body.fiatCurrency || "USD");

    const token = await getAccessToken(apiKey, apiSecret);

    const widgetParams: Record<string, unknown> = {
      apiKey, referrerDomain,
      productsAvailed: "BUY",
      fiatCurrency,
      defaultPaymentMethod: "credit_debit_card",
      cryptoCurrencyCode, network,
      partnerOrderId,
    };
    if (fiatAmount > 0) widgetParams.fiatAmount = fiatAmount;
    if (walletAddress) widgetParams.walletAddress = walletAddress;
    if (partnerCustomerId) widgetParams.partnerCustomerId = partnerCustomerId;
    if (email) widgetParams.email = email;

    const sres = await fetch(`${GW_BASE}/api/v2/auth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access-token": token },
      body: JSON.stringify({ widgetParams }),
    });
    const sd = await sres.json().catch(() => ({}));
    const widgetUrl = sd?.data?.widgetUrl || sd?.widgetUrl;
    if (!widgetUrl) return json({ ok: false, error: "session failed: " + JSON.stringify(sd).slice(0, 400) }, 502);
    return json({ ok: true, widgetUrl });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
