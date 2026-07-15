-- Alpexa — agent commission: server-side re-verification (마스터감사 🟥 #3)
-- ============================================================================
-- BEFORE THIS FILE: commission was computed ONLY in the browser (agent.html
-- commission(), manager-mobile agentCommission()) and the payout-availability
-- check lived ONLY in agent.html. The server stored whatever agent_payouts row
-- a client inserted — nothing re-verified the amount against what the agent
-- actually earned, and (RLS permitting) a client could even insert
-- status='approved' or method='adjust' rows directly.
--
-- INVARIANT (proven by tests/agent-payout-guard.test.js):
--   per agent:  Σ(approved + pending non-adjust payouts)
--                 ≤  server-recomputed lifetime commission + Σ(approved adjusts)
--
-- The server formula below is the same one both UIs display (single source of
-- truth for enforcement; the UIs stay display-only):
--   fx     :  Σ(stake·share) over server='fx',  kind='fx_close'      × agents.fx_per_lot
--   sports :  Σ(−pnl·share)  over server='sports', kind='bet_*'      × agents.sports_net_pct/100
--   crypto :  Σ(stake·share) over kind='crypto_fee'                  × agents.crypto_fee_pct/100
--   total  :  greatest(0, fx + sports + crypto)   -- negative sports pool carries over
--
-- Existing flows KEEP WORKING: agent portal inserts pending requests exactly as
-- before (now bounded); back office approves / adjusts exactly as before (now
-- re-verified at the moment of approval — where money actually leaves).
-- ============================================================================

-- ① Lifetime commission, recomputed server-side from settlements × rates × share.
create or replace function public.agent_commission_for(p_code text)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_rate public.agents%rowtype; v_fx numeric; v_sp numeric; v_cr numeric;
begin
  select * into v_rate from public.agents where code = p_code;
  if v_rate.code is null then return 0; end if;
  -- One share per customer (dedupe defensively with max(), mirroring the UI's
  -- one-entry-per-customer map; duplicate links must not double-count).
  with links as (
    select cust_id, max(coalesce(share,100))/100.0 as sh
      from public.agent_links where agent_code = p_code group by cust_id
  )
  select
    coalesce(sum(case when s.server='fx'     and s.kind='fx_close'      then s.stake * l.sh end),0),
    coalesce(sum(case when s.server='sports' and left(s.kind,4)='bet_'  then -s.pnl  * l.sh end),0),
    coalesce(sum(case when s.kind='crypto_fee'                          then s.stake * l.sh end),0)
    into v_fx, v_sp, v_cr
  from public.settlements s join links l on l.cust_id = s.cust_id;
  return round(greatest(0,
      v_fx * coalesce(v_rate.fx_per_lot,0)
    + v_sp * coalesce(v_rate.sports_net_pct,0)/100.0
    + v_cr * coalesce(v_rate.crypto_fee_pct,0)/100.0)::numeric, 2);
end;$$;

-- ② Available-to-withdraw (display helper; same clamp the portal shows).
create or replace function public.agent_available_for(p_code text)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_net numeric;
begin
  select coalesce(sum(case
      when lower(coalesce(method,''))='adjust' and status='approved' then amount
      when lower(coalesce(method,''))<>'adjust' and status in ('approved','pending') then -amount
      else 0 end),0)
    into v_net from public.agent_payouts where agent_code = p_code;
  return greatest(0, round((public.agent_commission_for(p_code) + v_net)::numeric, 2));
end;$$;

grant execute on function public.agent_commission_for(text) to anon, authenticated;
grant execute on function public.agent_available_for(text)  to anon, authenticated;

-- ③ GUARD: every write to agent_payouts is bounded by the invariant.
create or replace function public.guard_agent_payout()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_comm numeric; v_others numeric;
begin
  -- Erasing paid history would inflate the room — back office only.
  if TG_OP = 'DELETE' then
    if not public.is_admin() then
      raise exception 'Back office only.' using errcode = 'check_violation';
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' and not public.is_admin() then
    -- Illegal states unrepresentable: a portal insert can only ever be a
    -- plain PENDING request — never self-approved, never an adjustment.
    NEW.status := 'pending'; NEW.txid := null; NEW.decided_at := null;
    if lower(coalesce(NEW.method,'')) = 'adjust' then
      raise exception 'Adjustments are back-office only.' using errcode = 'check_violation';
    end if;
    if NEW.amount is null or NEW.amount < 50 then
      raise exception 'Minimum payout is $50.' using errcode = 'check_violation';
    end if;
  end if;

  if TG_OP = 'UPDATE' and not public.is_admin() then
    raise exception 'Back office only.' using errcode = 'check_violation';
  end if;

  -- Re-verify the INVARIANT whenever a request enters or gets approved.
  -- (INSERT: the new row isn't visible to the sum yet. UPDATE: exclude self.)
  if TG_OP = 'INSERT'
     or (TG_OP = 'UPDATE' and lower(coalesce(NEW.status,'')) = 'approved'
                          and lower(coalesce(OLD.status,'')) <> 'approved') then
    if lower(coalesce(NEW.method,'')) <> 'adjust' then
      v_comm := public.agent_commission_for(NEW.agent_code);
      select coalesce(sum(case
          when lower(coalesce(method,''))='adjust' and status='approved' then amount
          when lower(coalesce(method,''))<>'adjust' and status in ('approved','pending') then -amount
          else 0 end),0)
        into v_others from public.agent_payouts
       where agent_code = NEW.agent_code and (TG_OP = 'INSERT' or id <> NEW.id);
      if coalesce(NEW.amount,0) > v_comm + v_others + 0.001 then
        raise exception 'Amount exceeds earned commission (available $%).',
          greatest(0, round((v_comm + v_others)::numeric,2)) using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_guard_agent_payout on public.agent_payouts;
create trigger trg_guard_agent_payout
  before insert or update or delete on public.agent_payouts
  for each row execute function public.guard_agent_payout();
