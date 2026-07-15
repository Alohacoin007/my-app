# fx-prices — deploy notes

Pulls real-time FX/metals from Polygon.io into the shared `prices` table.
The paid Polygon key lives ONLY in this function's env — never in the client.

## Prerequisites
- Polygon.io **paid Currencies plan** (free tier is delayed → not real-time).
- `prices` table with a UNIQUE/PK on `symbol` (so upsert merges). If it isn't
  unique yet, run once:
  ```sql
  alter table prices add constraint prices_symbol_key unique (symbol);
  ```

## 1. Set the secret (key stays server-side)
Dashboard → Edge Functions → Manage secrets (or CLI):
```
POLYGON_KEY = <your polygon key>
# optional, to stop public abuse of the endpoint:
CRON_SECRET = <any long random string>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` are auto-provided.

## 2. Deploy
- Dashboard: Edge Functions → Deploy a new function → name `fx-prices` → paste `index.ts`.
- or CLI: `supabase functions deploy fx-prices`

## 3. Test
```
curl "https://<project>.supabase.co/functions/v1/fx-prices?token=<CRON_SECRET>"
# -> { ok:true, wrote: N, symbols:[...] }
```
Then check the `prices` table — EURUSD/GBPUSD/etc. should show live mids.

## 4. Schedule (every ~5–10s) with pg_cron + pg_net
SQL editor:
```sql
-- enable once
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- run every 10 seconds
select cron.schedule('fx-prices-10s', '10 seconds', $$
  select net.http_get(
    url := 'https://<project>.supabase.co/functions/v1/fx-prices?token=<CRON_SECRET>'
  );
$$);
```
(To stop: `select cron.unschedule('fx-prices-10s');`)

## 5. Flip the app to the real feed
Once `prices` carries live Polygon mids, switch `trading.html` to anchor on
`window.__alpexaFXFeed` (already pulled from `prices` every 1.5s) and disable the
embedded Twelve Data fetch. (Done at deploy time so FX isn't destabilised before
the feed is live.)
