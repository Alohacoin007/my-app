// Alpexa — sports-settle
// SERVER-SIDE bet settlement. Replaces the old client-side "I won, credit me"
// path (which let a customer post their own ledger credit = self-credit fraud).
//
// Flow:
//   1) Pull final scores from ESPN (public, no key) for NFL/NBA/MLB/NHL.
//   2) Load open sports bets from `positions` (status=open).
//   3) Grade every leg (moneyline / spread / total) — same rules as the app.
//   4) For each fully-graded bet, atomically CLAIM it (delete the row; the app's
//      claim does the same, so only ONE actor credits a bet) and then, server-
//      side with the service role:
//        • winner  → ledger credit of the payout (ref=betpay-<id>, idempotent)
//        • write a settlements record (bet_won / bet_lost) for the back office
//   The trg_apply_ledger trigger applies the ledger row to accounts.balance.
//
// Trigger on a schedule (every ~3–5 min) via pg_cron, like sports-odds.
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto). Optional CRON_SECRET.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const LEAGUES = [
  { lg: "NFL", path: "football/nfl" },
  { lg: "NBA", path: "basketball/nba" },
  { lg: "MLB", path: "baseball/mlb" },
  { lg: "NHL", path: "hockey/nhl" },
];

type Result = { hs: number; as: number; homeNm: string; awayNm: string; homeAb: string; awayAb: string };

async function fetchLeagueResults(L: { lg: string; path: string }, out: Record<string, Result>) {
  const direct = `https://site.api.espn.com/apis/site/v2/sports/${L.path}/scoreboard`;
  const tries = [direct, "https://corsproxy.io/?url=" + encodeURIComponent(direct)];
  for (const u of tries) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const d = await res.json();
      for (const ev of (d.events || [])) {
        try {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp || !comp.competitors) continue;
          const st = (ev.status && ev.status.type) ? ev.status.type : {};
          if (st.state !== "post") continue; // only FINAL games
          const hc = comp.competitors.find((c: any) => c.homeAway === "home");
          const ac = comp.competitors.find((c: any) => c.homeAway === "away");
          if (!hc || !ac || !hc.team || !ac.team) continue;
          const hs = parseInt(hc.score, 10), as = parseInt(ac.score, 10);
          if (isNaN(hs) || isNaN(as)) continue;
          const gid = L.lg + "_" + ev.id;
          out[gid] = {
            hs, as,
            homeNm: hc.team.shortDisplayName || hc.team.name || hc.team.displayName || "Home",
            awayNm: ac.team.shortDisplayName || ac.team.name || ac.team.displayName || "Away",
            homeAb: String(hc.team.abbreviation || hc.team.shortDisplayName || "").toUpperCase(),
            awayAb: String(ac.team.abbreviation || ac.team.shortDisplayName || "").toUpperCase(),
          };
        } catch (_e) { /* skip event */ }
      }
      return; // got this league
    } catch (_e) { /* try next mirror */ }
  }
}

function teamSide(team: string, r: Result): "home" | "away" | null {
  const t = (team || "").toLowerCase().trim(); if (!t) return null;
  if (r.homeNm && r.homeNm.toLowerCase() === t) return "home";
  if (r.awayNm && r.awayNm.toLowerCase() === t) return "away";
  if (r.homeAb && r.homeAb.toLowerCase() === t) return "home";
  if (r.awayAb && r.awayAb.toLowerCase() === t) return "away";
  if (r.homeNm && r.homeNm.toLowerCase().indexOf(t) >= 0) return "home";
  if (r.awayNm && r.awayNm.toLowerCase().indexOf(t) >= 0) return "away";
  return null;
}
// Returns 'won' | 'lost' | 'push' | null(not gradeable). Mirrors the app's gradeLeg.
function gradeLeg(l: any, r: Result): string | null {
  const sel = (l.sel || l.pk || "").trim();
  const mkt = (l.market || "").toLowerCase();
  const hs = r.hs, as = r.as;
  if (typeof hs !== "number" || typeof as !== "number") return null;
  if (mkt.indexOf("total") >= 0 || /^(over|under)/i.test(sel)) {
    const m = sel.match(/(over|under)\s+([\d.]+)/i); if (!m) return null;
    const tot = hs + as, line = parseFloat(m[2]); if (tot === line) return "push";
    return (m[1].toLowerCase() === "over") ? (tot > line ? "won" : "lost") : (tot < line ? "won" : "lost");
  }
  if (mkt.indexOf("money") >= 0 || / ML$/i.test(sel)) {
    const team = sel.replace(/\s*ML$/i, "").trim(), side = teamSide(team, r); if (!side) return null;
    const my = side === "home" ? hs : as, op = side === "home" ? as : hs; if (my === op) return "push"; return my > op ? "won" : "lost";
  }
  if (mkt.indexOf("spread") >= 0 || /[-+][\d.]+\s*$/.test(sel)) {
    const m = sel.match(/([-+]?[\d.]+)\s*$/); if (!m) return null;
    const line = parseFloat(m[1]), team = sel.replace(/\s*[-+]?[\d.]+\s*$/, "").trim(), side = teamSide(team, r); if (!side) return null;
    const my = side === "home" ? hs : as, op = side === "home" ? as : hs, diff = (my + line) - op;
    if (diff === 0) return "push"; return diff > 0 ? "won" : "lost";
  }
  return null;
}
function decOf(l: any): number {
  if (+l.dec0 > 1) return +l.dec0;
  const am = +(l.am0 != null ? l.am0 : l.am) || 0;
  if (!am) return 1;
  return am > 0 ? 1 + am / 100 : 1 + 100 / Math.abs(am);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && url.searchParams.get("token") !== CRON_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: "Supabase env missing" }, 500);
  const H = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json" };

  // 1) Final scores from ESPN.
  const results: Record<string, Result> = {};
  await Promise.all(LEAGUES.map((L) => fetchLeagueResults(L, results)));
  // Debug: ?debug=1 returns the final-game results map (gid -> score) so we can
  // craft a controlled test bet on a real finished game.
  if (url.searchParams.get("debug")) return json({ ok: true, results });

  // 2) Open sports bets.
  const posRes = await fetch(`${SB_URL}/rest/v1/positions?server=eq.sports&status=eq.open&select=id,cust_id,acct_no,local_id,stake,meta,symbol`, { headers: H });
  if (!posRes.ok) return json({ ok: false, error: "positions read " + posRes.status }, 500);
  const positions = await posRes.json();

  const settled: any[] = [];
  for (const p of positions) {
    try {
      const meta = (p.meta && typeof p.meta === "object") ? p.meta : {};
      const legs = Array.isArray(meta.legs) ? meta.legs : [];
      if (!legs.length) continue;
      const stake = +meta.stake || +p.stake || 0;
      let allDone = true, anyLost = false, decMul = 1;
      for (const l of legs) {
        const r = results[l.gid]; if (!r) { allDone = false; break; }
        const g = gradeLeg(l, r); if (g === null) { allDone = false; break; }
        if (g === "lost") anyLost = true; else if (g === "won") decMul *= decOf(l);
      }
      if (!allDone) continue; // not all games final yet

      // 3) CLAIM atomically: delete the open row. Only the actor that actually
      // removes it proceeds — prevents double credit (app uses the same claim).
      const claim = await fetch(`${SB_URL}/rest/v1/positions?id=eq.${encodeURIComponent(p.id)}&status=eq.open`, {
        method: "DELETE", headers: { ...H, "Prefer": "return=representation" },
      });
      const claimed = claim.ok ? await claim.json() : [];
      if (!Array.isArray(claimed) || !claimed.length) continue; // someone else settled it

      const won = !anyLost;
      const payout = won ? Math.round(stake * decMul * 100) / 100 : 0;
      const ref = "betpay-" + String(p.local_id || p.id);

      // 4a) Credit the payout to the ledger (winners only). Idempotent via ref.
      if (won && payout > 0 && p.acct_no) {
        await fetch(`${SB_URL}/rest/v1/ledger`, {
          method: "POST", headers: { ...H, "Prefer": "return=minimal" },
          body: JSON.stringify({ acct_no: p.acct_no, cust_id: p.cust_id, server: "sports", kind: "bet_won", amount: payout, ref }),
        });
      }
      // 4b) Settlement record for the back office (company P&L by period).
      await fetch(`${SB_URL}/rest/v1/settlements`, {
        method: "POST", headers: { ...H, "Prefer": "return=minimal" },
        body: JSON.stringify({
          cust_id: p.cust_id, acct_no: p.acct_no, server: "sports",
          kind: won ? "bet_won" : "bet_lost", local_id: String(p.local_id || p.id),
          ticket: String(meta.ticket || ""), symbol: p.symbol || meta.type || "Bet",
          stake, pnl: won ? (payout - stake) : -stake, detail: "server-settled",
        }),
      });
      settled.push({ local_id: p.local_id, result: won ? "won" : "lost", payout });
    } catch (e) { /* skip this bet */ }
  }

  return json({ ok: true, finalGames: Object.keys(results).length, openBets: positions.length, settled });
});
