-- Alpexa — DAILY REPORT data (read-only): assembles the whole management report for one
-- day server-side and returns it as JSON in the exact shape reports/render-html.js expects.
-- send-daily-report.js calls this ONE rpc instead of pulling raw rows to Node.
-- Money truth: sports flows via `ledger` (kind='bet' stakes, ref 'betpay-%' payouts);
-- crypto via `crypto_trades` (gross/fee); FX realized P&L via `settlements` (kind='fx_close').
-- Security block reuses reconcile_balances() (deploy daily_reconciliation.sql first).
--
-- Deploy: run this whole file in the Supabase SQL editor (needs daily_reconciliation.sql).
-- Test:   select public.daily_report();            -- yesterday (Las Vegas day)
--         select public.daily_report('2026-07-08');
-- ============================================================================
create or replace function public.daily_report(
  p_date date default ((now() at time zone 'America/Los_Angeles')::date - 1),
  p_hv numeric default 100000
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_from timestamptz := (p_date::timestamp at time zone 'America/Los_Angeles');
  v_to   timestamptz := ((p_date + 1)::timestamp at time zone 'America/Los_Angeles');
  v_stake numeric; v_pay numeric; v_scnt int;
  v_ccnt int; v_cvol numeric; v_cfee numeric;
  v_fcnt int; v_flots numeric; v_fpnl numeric;
  v_mism int; v_mrows jsonb; v_hv jsonb;
begin
  -- SPORTS (ledger is the money truth): stakes (kind='bet', negative) + payouts (ref 'betpay-%')
  select coalesce(-sum(amount) filter (where kind='bet'), 0),
         coalesce(sum(amount) filter (where ref like 'betpay-%'), 0),
         count(*) filter (where kind='bet')
    into v_stake, v_pay, v_scnt
    from public.ledger
   where server='sports' and created_at >= v_from and created_at < v_to;

  -- CRYPTO trades
  select count(*), coalesce(sum(gross),0), coalesce(sum(fee),0)
    into v_ccnt, v_cvol, v_cfee
    from public.crypto_trades
   where created_at >= v_from and created_at < v_to;

  -- FX closes (realized P&L banked via settlements)
  select count(*), coalesce(sum(stake),0), coalesce(sum(pnl),0)
    into v_fcnt, v_flots, v_fpnl
    from public.settlements
   where server='fx' and kind='fx_close' and created_at >= v_from and created_at < v_to;

  -- SECURITY: whole-book integrity (snapshot, not date-scoped)
  select count(*), coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    into v_mism, v_mrows
    from public.reconcile_balances() r;

  -- HIGH-VALUE: yesterday's biggest single real-cash movements (≥ p_hv)
  select coalesce(jsonb_agg(x order by (x->>'amount')::numeric desc), '[]'::jsonb) into v_hv
    from (
      select jsonb_build_object('domain','crypto','cust',cust_id,'amount',round(gross,2)) x
        from public.crypto_trades where created_at>=v_from and created_at<v_to and gross>=p_hv
      union all
      select jsonb_build_object('domain','sports','cust',cust_id,'amount',round(-amount,2))
        from public.ledger where server='sports' and kind='bet'
              and created_at>=v_from and created_at<v_to and (-amount)>=p_hv
    ) x;

  return jsonb_build_object(
    'generated_at', p_date::text,
    'ok', (v_mism = 0),
    'sports', jsonb_build_object('count', v_scnt, 'totalStake', round(v_stake,2),
        'totalPayout', round(v_pay,2), 'houseProfit', round(v_stake - v_pay, 2)),
    'crypto', jsonb_build_object('count', v_ccnt, 'tradeVolume', round(v_cvol,2), 'feeRevenue', round(v_cfee,2)),
    -- spreadRevenue/swapTotal/liquidations are not separable from settlements today (the house
    -- edge is inside realizedPnl) → reported as 0 pending dedicated columns. realizedPnl is exact.
    'fx', jsonb_build_object('count', v_fcnt, 'lotVolume', round(v_flots,2),
        'spreadRevenue', 0, 'swapTotal', 0, 'liquidations', 0, 'realizedPnl', round(v_fpnl,2)),
    'security', jsonb_build_object('mismatchTotal', v_mism, 'pass', (v_mism=0),
        'mismatches', v_mrows, 'highValueAlerts', v_hv)
  );
end;$$;
