// Alpexa — first Edge Function (health check / "is the kitchen alive?")
// Deployed in Supabase Dashboard → Edge Functions. This is the foundation
// for all server-side work (auth, crypto payouts, email, KYC) later.

Deno.serve(async (req) => {
  // CORS — let our web apps call this from the browser.
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Alpexa kitchen is alive 🍳",
      time: new Date().toISOString(),
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
