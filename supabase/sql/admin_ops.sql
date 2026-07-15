-- Alpexa — admin money ops (server-authoritative back-office god-mode)
-- ============================================================================
-- Replaces the old path where the BACK OFFICE inserted a `commands` row and the
-- CUSTOMER's app executed it client-side (posting a ledger delta). After the
-- ledger write-lock, a normal-user client can't post to the ledger — so these
-- admin actions move to SECURITY DEFINER RPCs the signed-in admin calls directly.
--
-- Both are is_admin()-gated: only a real admin JWT (manager signed in via the
-- existing adminSignIn) can call them. SECURITY DEFINER → they bypass the ledger
-- RLS lock; the trg_apply_ledger trigger applies the change to accounts.balance.
--
-- Customer app reflects the result via its existing sync (pullServerBets drops a
-- voided bet, syncBalancesFromServer adopts the new balance). No client money write.
-- ============================================================================

-- ① Void an OPEN sports bet: refund the stake (idempotent) + remove the position.
create or replace function public.admin_void_bet(p_local_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_pos public.positions%rowtype;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;

  select * into v_pos from public.positions
   where local_id = p_local_id and server='sports' and kind='bet' and status='open' limit 1;
  if v_pos.local_id is null then
    return jsonb_build_object('ok',false,'error','bet not found or already settled'); end if;

  if not exists (select 1 from public.ledger where ref = 'void-'||p_local_id) then
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (v_pos.acct_no, v_pos.cust_id, 'sports', 'bet_void', coalesce(v_pos.stake,0), 'void-'||p_local_id);
  end if;
  delete from public.positions where local_id = p_local_id and server='sports' and status='open';

  return jsonb_build_object('ok',true,'refunded',coalesce(v_pos.stake,0),'acct',v_pos.acct_no);
end;$$;


-- ② Set a balance-backed account (sports/fx) to an exact target via a corrective
--    ledger row (delta = target − current). Crypto uses crypto_holdings (separate).
create or replace function public.admin_set_balance(p_acct text, p_target numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_acct public.accounts%rowtype; v_cust text; v_delta numeric;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_target is null or p_target < 0 then return jsonb_build_object('ok',false,'error','bad target'); end if;

  select * into v_acct from public.accounts where acct_no = p_acct;
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if v_acct.server not in ('sports','fx') then
    return jsonb_build_object('ok',false,'error','admin_set_balance is for balance-backed servers (sports/fx)'); end if;

  v_delta := round(p_target - coalesce(v_acct.balance,0), 2);
  if abs(v_delta) < 0.005 then return jsonb_build_object('ok',true,'noop',true,'balance',coalesce(v_acct.balance,0)); end if;

  select cust_id into v_cust from public.players where id = v_acct.player_id;
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_acct, v_cust, v_acct.server, 'admin_adjust', v_delta,
            'adminset-'||p_acct||'-'||to_char(now(),'YYYYMMDDHH24MISSMSUS'));

  return jsonb_build_object('ok',true,'delta',v_delta,'balance',p_target);
end;$$;
