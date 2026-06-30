-- get_statement(p_acct, p_month) — monthly account statement, SINGLE SOURCE OF TRUTH.
--
-- Returns opening/closing/net + per-kind breakdown + the full transaction list for ONE
-- account, computed PURELY from `ledger` so the numbers can never drift from the invariant
--   balance = opening + Σ(ledger)      (enforced by trigger apply_ledger)
--
-- The email (summary + last 6 tx) and the web page (full list) BOTH call this one RPC, so
-- there is exactly one place that defines the truth (#5 single-source). No client math.
--
-- Month window = America/Los_Angeles (Las Vegas / PDT·PST, DST-aware), per house rule.
--
-- Ownership: a logged-in user may only read an account they own
--   (auth.uid() → players.auth_id → accounts.player_id). The monthly-send cron runs as
--   service_role (auth.uid() IS NULL) — a trusted backend call — and is allowed. `anon`
--   can't reach it at all (revoked below). SECURITY DEFINER + this check = RLS-equivalent.
--
-- Deploy: run in Supabase SQL editor (USER runs). Read-only — moves no money.

create or replace function public.get_statement(p_acct text, p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_acct    public.accounts%rowtype;
  v_start   timestamptz;
  v_end     timestamptz;
  v_balance numeric;
  v_after   numeric;
  v_in      numeric;
  v_opening numeric;
  v_closing numeric;
  v_by_kind jsonb;
  v_tx      jsonb;
begin
  -- validate month string 'YYYY-MM'
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('ok', false, 'error', 'bad month (expected YYYY-MM)');
  end if;

  select * into v_acct from public.accounts where acct_no = p_acct;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'account not found');
  end if;

  -- Ownership. A normal authenticated caller (uid not null) must own the account.
  -- A null uid means a privileged backend (service_role cron) — allowed. anon is blocked
  -- by the GRANT below, so a null uid here is never anon.
  if v_uid is not null then
    if not exists (
      select 1 from public.players pl where pl.id = v_acct.player_id and pl.auth_id = v_uid
    ) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  -- Month window in Las Vegas local time (DST-aware). The wall-clock midnight of the 1st
  -- is interpreted AS Los Angeles time → a precise UTC instant; end = next month's 1st.
  v_start := ((p_month || '-01')::timestamp) at time zone 'America/Los_Angeles';
  v_end   := (((p_month || '-01')::date + interval '1 month')::timestamp) at time zone 'America/Los_Angeles';

  -- Derive closing/opening BACKWARD from the current balance (the truth) through ledger,
  -- so they are guaranteed consistent with accounts.balance — no separate opening column.
  v_balance := round(coalesce(v_acct.balance, 0), 2);
  select coalesce(sum(amount), 0) into v_after
    from public.ledger where acct_no = p_acct and created_at >= v_end;
  select coalesce(sum(amount), 0) into v_in
    from public.ledger where acct_no = p_acct and created_at >= v_start and created_at < v_end;
  v_closing := round(v_balance - v_after, 2);
  v_opening := round(v_closing - v_in, 2);

  -- Per-kind breakdown within the month (exact, self-documenting — the display layer maps
  -- kinds to friendly labels like Deposits/Withdrawals/Bets/Staking; SQL stays truthful).
  select coalesce(
           jsonb_agg(jsonb_build_object('kind', kind, 'total', total, 'count', cnt) order by kind),
           '[]'::jsonb)
    into v_by_kind
  from (
    select kind, round(sum(amount), 2) as total, count(*) as cnt
      from public.ledger
     where acct_no = p_acct and created_at >= v_start and created_at < v_end
     group by kind
  ) g;

  -- Full transaction list, newest first (web shows all; email takes the last 6).
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'at', created_at, 'kind', kind, 'amount', round(amount, 2), 'ref', ref)
             order by created_at desc, id desc),
           '[]'::jsonb)
    into v_tx
  from public.ledger
  where acct_no = p_acct and created_at >= v_start and created_at < v_end;

  return jsonb_build_object(
    'ok',         true,
    'acct',       p_acct,
    'server',     v_acct.server,
    'month',      p_month,
    'opening',    v_opening,
    'closing',    v_closing,
    'net_change', round(v_in, 2),
    'money_in',   round((select coalesce(sum(amount), 0)  from public.ledger
                          where acct_no = p_acct and created_at >= v_start and created_at < v_end and amount > 0), 2),
    'money_out',  round((select coalesce(-sum(amount), 0) from public.ledger
                          where acct_no = p_acct and created_at >= v_start and created_at < v_end and amount < 0), 2),
    'by_kind',    v_by_kind,
    'tx',         v_tx
  );
end;
$$;

-- Lock down: never world/anon callable. Owners (authenticated, checked above) + the
-- monthly-send backend (service_role) only.
revoke all on function public.get_statement(text, text) from public;
revoke all on function public.get_statement(text, text) from anon;
grant execute on function public.get_statement(text, text) to authenticated;
grant execute on function public.get_statement(text, text) to service_role;
