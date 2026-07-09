-- Alpexa — DAILY BALANCE RECONCILIATION (asset integrity, 1-cent tolerance)
-- ============================================================================
-- The money invariant (CLAUDE.md): balance == opening + Σ(ledger), applied by the
-- apply_ledger trigger — the ONLY writer of accounts.balance. So a mismatch means a
-- balance was written OUTSIDE the ledger (a bug or tamper) or a ledger row vanished.
-- opening = accounts.bonus (the non-withdrawable welcome seed — the same basis the
-- back-office integrity check already reconciles against).
--
-- Scope: sports/fx (ledger-backed). Crypto lives in crypto_holdings (a separate
-- subsystem, price-valued) — reconciled separately, not here.
--
-- Read-only: this NEVER writes a balance. It only reports/logs drift, so it can never
-- itself corrupt money. Run daily via pg_cron; a mismatch raises a WARNING + logs a row.
--
-- Deploy: run this whole file in the Supabase SQL editor. Idempotent.
-- ============================================================================

-- ① audit log of every reconciliation run
create table if not exists public.reconciliation_log (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  mismatches  int not null,
  total_bal   numeric,
  total_expected numeric,
  total_diff  numeric,
  detail      jsonb
);
alter table public.reconciliation_log enable row level security;  -- admin-read only via is_admin policy elsewhere

-- ② per-account drift: which accounts' balance ≠ bonus + Σledger (beyond tolerance)
create or replace function public.reconcile_balances(p_tol numeric default 0.01)
returns table(acct_no text, server text, bal numeric, expected numeric, diff numeric)
language sql stable security definer set search_path to 'public' as $$
  select a.acct_no, a.server,
         round(coalesce(a.balance,0),2) as bal,
         round(coalesce(a.bonus,0) + coalesce(l.s,0), 2) as expected,
         round(coalesce(a.balance,0) - (coalesce(a.bonus,0) + coalesce(l.s,0)), 2) as diff
    from public.accounts a
    left join lateral (select sum(amount) s from public.ledger where acct_no = a.acct_no) l on true
   where a.server in ('sports','fx')
     and abs(coalesce(a.balance,0) - (coalesce(a.bonus,0) + coalesce(l.s,0))) > p_tol;
$$;

-- ③ daily runner: logs a row, and RAISES a warning if a single cent is off
create or replace function public.reconcile_daily()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_n int; v_rows jsonb; v_tb numeric; v_te numeric;
begin
  -- global totals (fast system-wide check): Σbalance vs Σbonus + Σledger over sports/fx
  select coalesce(sum(a.balance),0),
         coalesce(sum(a.bonus),0) + coalesce((select sum(amount) from public.ledger l
             join public.accounts aa on aa.acct_no=l.acct_no where aa.server in ('sports','fx')),0)
    into v_tb, v_te
    from public.accounts a where a.server in ('sports','fx');

  -- per-account offenders
  select count(*), coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_n, v_rows
    from public.reconcile_balances() r;

  insert into public.reconciliation_log(mismatches, total_bal, total_expected, total_diff, detail)
    values (v_n, round(v_tb,2), round(v_te,2), round(v_tb - v_te,2), v_rows);

  if v_n > 0 or abs(v_tb - v_te) > 0.01 then
    raise warning 'RECONCILIATION DRIFT: % account(s), total off by % (balance % vs ledger %) — %',
      v_n, round(v_tb - v_te,2), round(v_tb,2), round(v_te,2), v_rows;
  end if;

  return jsonb_build_object('ok', (v_n = 0 and abs(v_tb - v_te) <= 0.01),
    'mismatches', v_n, 'total_balance', round(v_tb,2), 'total_expected', round(v_te,2),
    'total_diff', round(v_tb - v_te,2), 'detail', v_rows);
end;$$;

-- ④ schedule daily (03:00 Las Vegas / 10:00 UTC). Requires pg_cron.
-- select cron.schedule('daily-reconcile', '0 10 * * *', $$ select public.reconcile_daily(); $$);

-- Manual run:  select public.reconcile_daily();
-- Review log:  select ran_at, mismatches, total_diff from public.reconciliation_log order by ran_at desc limit 30;
