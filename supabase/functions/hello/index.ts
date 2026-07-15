// Alpexa — hello (public health check, with CORS). First-test version: no auth,
// so we can verify the kitchen is alive just by opening the URL. We'll add the
// real auth (withSupabase publishable/secret) when we build protected functions.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(
    JSON.stringify({ ok: true, message: "Alpexa kitchen is alive 🍳", time: new Date().toISOString() }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
