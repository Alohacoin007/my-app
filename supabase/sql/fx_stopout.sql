-- Alpexa — FX STOP-OUT (server-side forced liquidation) + shared realized-P&L helper
-- ============================================================================
-- B-Book safety net. When an FX account's MARGIN LEVEL (= equity / used_margin × 100)
-- falls below the stop-out threshold, the server force-closes the WORST-loss position
-- first, re-checks, and repeats until the account is healthy again — exactly like a
-- regulated MT5 broker. Closing banks realized P&L through `settlements`
-- (trg_settlement_balance → accounts.balance), the SAME path fx_close uses. The client
-- never touches balance; a client can NOT invoke this (execute is revoked).
--
-- DEPLOY ORDER:  fx_open_margin.sql  →  THEN this file.
--   (this uses fx_notional_usd() / fx_lev_cap() defined in fx_open_margin.sql, and
--    fx_specs from fx_close.sql.)
--
-- ⚠️ LOCKSTEP: public.fx_realized_pnl below is a FAITHFUL PORT of fx_close.sql's P&L +
--    spread math. If you ever change spread/lot/conversion in fx_close.sql, change it
--    here too, or floating (stop-out) will diverge from realized (fx_close).
-- ============================================================================

-- 1) Realized P&L (USD) for a position marked at the CURRENT server price, WITH the
--    close-side spread — identical to fx_close. Returns NULL if it can't be priced
--    (missing spec / missing-or-stale price / missing cross rate) so callers can bail
--    safely instead of liquidating on bad data.
create or replace function public.fx_realized_pnl(
  p_symbol text, p_side text, p_open numeric, p_size numeric
) returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_cls text; v_mid numeric; v_pts timestamptz;
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0; v_close numeric;
  v_lot numeric; v_dist numeric; v_pnlq numeric; v_pnl numeric;
  v_base text; v_quote text; v_qmid numeric; v_q2usd numeric;
begin
  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return null; end if;
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return null; end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then return null; end if;

  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = p_symbol limit 1;
    v_pip := case when p_symbol like '%JPY' then 0.01
                  when p_symbol = 'XAUUSD' then 0.01
                  when p_symbol = 'XAGUSD' then 0.001
                  else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
  else
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    v_half := v_mid * greatest(
        (case v_cls when 'CRYPTO' then 10 when 'STOCK' then 8 when 'INDEX' then 6 else 0 end),
        coalesce(v_spr,0)
      ) / 10000.0 / 2.0;
  end if;
  v_close := v_mid + (case when upper(p_side) = 'BUY' then -v_half else v_half end);

  v_lot  := case when p_symbol = 'XAUUSD' then 100 when p_symbol = 'XAGUSD' then 5000
                 when v_cls = 'FX' then 100000 else 1 end;
  v_dist := (v_close - p_open) * (case when upper(p_side) = 'BUY' then 1 else -1 end);
  v_pnlq := v_dist * v_lot * p_size;
  if v_cls <> 'FX' then
    v_pnl := v_pnlq;
  else
    v_base := left(p_symbol,3); v_quote := substr(p_symbol,4,3);
    if v_quote = 'USD' then
      v_pnl := v_pnlq;
    elsif v_base = 'USD' then
      v_pnl := v_pnlq / v_mid;
    else
      select mid into v_qmid from public.prices where symbol = 'USD'||v_quote limit 1;
      if v_qmid is not null and v_qmid > 0 then v_q2usd := 1.0 / v_qmid;
      else
        select mid into v_qmid from public.prices where symbol = v_quote||'USD' limit 1;
        if v_qmid is not null and v_qmid > 0 then v_q2usd := v_qmid; end if;
      end if;
      if v_q2usd is null then return null; end if;
      v_pnl := v_pnlq * v_q2usd;
    end if;
  end if;
  return round(v_pnl, 2);
end;$$;

-- 2) Stop-out sweep. For each FX account with open positions, while margin level is
--    below p_level, force-close the worst-loss position (banking P&L via settlements),
--    re-evaluate, repeat. Skips an account whose positions can't be fully priced (never
--    liquidate on stale/missing data). p_level defaults to 30 (MT5-style).
create or replace function public.fx_stopout(p_level numeric default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r_acct record; r_pos record;
  v_used numeric; v_float numeric; v_unpriced int; v_bal numeric; v_equity numeric; v_level numeric;
  v_pnl numeric; v_closed int := 0; v_accts int := 0; v_guard int;
begin
  for r_acct in
    select distinct a.acct_no
      from public.accounts a
      join public.positions p on p.acct_no = a.acct_no and p.server = 'fx' and p.status = 'open'
     where a.server = 'fx'
  loop
    v_accts := v_accts + 1;
    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 500;   -- safety backstop (never spin)

      -- used margin (same formula as the fx_open D13 gate)
      select coalesce(sum(
               public.fx_notional_usd(po.symbol, sp.cls, po.size, po.open_price)
               / public.fx_lev_cap(sp.cls)
             ), 0)
        into v_used
        from public.positions po
        join public.fx_specs sp on sp.symbol = po.symbol
       where po.acct_no = r_acct.acct_no and po.server = 'fx' and po.status = 'open';
      exit when v_used <= 0;   -- nothing open / no margin used → healthy

      -- floating P&L + how many positions we could NOT price
      select coalesce(sum(public.fx_realized_pnl(po.symbol, po.side, po.open_price, po.size)), 0),
             count(*) filter (where public.fx_realized_pnl(po.symbol, po.side, po.open_price, po.size) is null)
        into v_float, v_unpriced
        from public.positions po
       where po.acct_no = r_acct.acct_no and po.server = 'fx' and po.status = 'open';
      exit when v_unpriced > 0;   -- can't fully value → DO NOT liquidate (safe)

      select balance into v_bal from public.accounts where acct_no = r_acct.acct_no;
      v_equity := coalesce(v_bal,0) + coalesce(v_float,0);
      v_level  := case when v_used > 0 then v_equity / v_used * 100 else null end;
      exit when v_level is null or v_level >= p_level;   -- healthy → done with this account

      -- worst-loss open position first (MT5 convention)
      select po.* into r_pos
        from public.positions po
       where po.acct_no = r_acct.acct_no and po.server = 'fx' and po.status = 'open'
       order by public.fx_realized_pnl(po.symbol, po.side, po.open_price, po.size) asc nulls last
       limit 1;
      exit when r_pos.local_id is null;

      v_pnl := public.fx_realized_pnl(r_pos.symbol, r_pos.side, r_pos.open_price, r_pos.size);
      exit when v_pnl is null;
      -- 적립 스왑 포함 (2026-07-22 불변식: 청산 경로 무관 실현손익 = 가격 P&L + meta.swap — fx_close.sql:142와 동일)
      v_pnl := round(v_pnl + coalesce((r_pos.meta->>'swap')::numeric, 0), 2);

      -- ATOMIC CLAIM (close only if still open — no double-bank vs a manual fx_close)
      update public.positions set status = 'closed', pnl = v_pnl
        where local_id = r_pos.local_id and acct_no = r_pos.acct_no and server = 'fx' and status = 'open';
      if found then
        -- bank via settlements (kind='fx_close' so daily_report/reconciliation pick it up;
        -- STOPOUT flagged in detail). trg_settlement_balance moves accounts.balance.
        insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
          values (r_pos.cust_id, r_pos.acct_no, 'fx', 'fx_close', r_pos.local_id, r_pos.symbol, r_pos.size, v_pnl,
                  'STOPOUT '||upper(r_pos.side)||' '||r_pos.size||' @ '||r_pos.open_price||
                  ' (level '||round(v_level,1)||'% < '||p_level||'%)');
        v_closed := v_closed + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'accounts_scanned', v_accts, 'positions_closed', v_closed, 'threshold', p_level);
end;$$;

-- 3) LOCK IT DOWN — only the server (cron / postgres) may trigger liquidations.
revoke all on function public.fx_stopout(numeric) from public;
revoke all on function public.fx_stopout(numeric) from anon, authenticated;

-- 4) Schedule: run every minute (pg_cron's finest granularity). For sub-minute reaction
--    an Edge function on a short timer can call `select public.fx_stopout(30);` instead.
--    Re-running this file is safe (unschedule-then-schedule).
do $$
begin
  perform cron.unschedule('fx_stopout') where exists (select 1 from cron.job where jobname = 'fx_stopout');
exception when others then null;
end$$;
select cron.schedule('fx_stopout', '* * * * *', $$ select public.fx_stopout(30); $$);

-- Manual test (run as needed):
--   select public.fx_stopout(30);                       -- one sweep now
--   select public.fx_realized_pnl('EURUSD','BUY',1.14,0.10);  -- spot-check a P&L
