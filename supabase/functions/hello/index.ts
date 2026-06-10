// Alpexa — first Edge Function (health check / "is the kitchen alive?")
// New Supabase format with built-in auth modes:
//   - "publishable" = called with the public (anon) key — normal customers
//   - "secret"      = called with the service/secret key — privileged admin ops
// This is the foundation for auth, crypto payouts, email, KYC later.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

console.info("Alpexa kitchen started");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, ctx) => {
    return Response.json({
      ok: true,
      message: "Alpexa kitchen is alive 🍳",
      authMode: ctx.authMode, // "publishable" or "secret"
      time: new Date().toISOString(),
    });
  }),
};
