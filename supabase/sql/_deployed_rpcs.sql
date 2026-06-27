-- ============================================================================
-- Alpexa — DEPLOYED RPC/TRIGGER AUDIT SNAPSHOT (D6)
-- Dumped from production via pg_get_functiondef (public schema). This is the
-- audit record so server-side money logic is reviewable in the repo, not just
-- in Supabase. Re-dump after any function change.
--
-- 🔴 CRITICAL FINDING (place_bet): submitted bet ODDS are NOT server-validated.
--    place_bet stores p_odds + p_meta (legs[].am) verbatim from the client, and
--    sports-settle pays stake × Π(legs[].am) on a win. A modified client can send
--    inflated leg odds and get paid on them. See 결함-로그.md / 출시-체크리스트 D12.
--    Fix needs: store offered lines server-side (sports-games) and have place_bet
--    reject legs whose odds deviate from the stored line (or have settle recompute
--    from server lines). Until then, the sportsbook payout is client-trusted.
--
-- Other notes:
--  • cash_out: pays before flipping status (no claim-first) → concurrent calls
--    could double-cash a bet. Low risk today (cash-out UI is disabled), but the
--    settlement claim-by-delete pattern should be used here too.
--  • Two near-identical triggers exist: guard_self_exclude (older) and
--    guard_self_exclusion (current). Harmless (same monotonic clamp) but the old
--    one should be dropped to avoid drift.
--  • Money RPCs verified SOUND: app_transfer, withdraw_hold, admin_set_balance,
--    admin_void_bet, crypto_trade, swap_crypto, stake_crypto, unstake_crypto,
--    sync_crypto_balance, fx_open, fx_close — ownership + idempotency + server
--    pricing/freshness all present.
-- ============================================================================

-- ── place_bet (🔴 odds not validated — see header) ──────────────────────────
CREATE OR REPLACE FUNCTION public.place_bet(p_acct text, p_stake numeric, p_potential numeric, p_symbol text, p_local_id text, p_meta jsonb, p_game text DEFAULT ''::text, p_pick text DEFAULT ''::text, p_odds numeric DEFAULT 0, p_size integer DEFAULT 1)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare v_player uuid; v_cust text; v_bal numeric;
begin
  select player_id into v_player from accounts where acct_no=p_acct and server='sports';
  if v_player is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists(select 1 from players where id=v_player and auth_id=auth.uid()) then
    return jsonb_build_object('ok',false,'error','not your account'); end if;
  select cust_id into v_cust from players where id=v_player;
  if exists(select 1 from positions where cust_id=v_cust and server='sports' and local_id=p_local_id) then
    return jsonb_build_object('ok',true,'duplicate',true); end if;
  if p_stake<=0 then return jsonb_build_object('ok',false,'error','bad stake'); end if;
  select balance into v_bal from accounts where acct_no=p_acct and server='sports';
  if v_bal < p_stake then return jsonb_build_object('ok',false,'error','insufficient balance'); end if;
  insert into ledger(acct_no,cust_id,server,kind,amount,ref)
    values (p_acct,v_cust,'sports','bet',-p_stake,'betstake-'||p_local_id);
  insert into positions(cust_id,acct_no,server,kind,local_id,symbol,side,stake,potential,status,game,pick,odds,size,meta)
    values (v_cust,p_acct,'sports','bet',p_local_id,p_symbol,'',p_stake,p_potential,'open',p_game,p_pick,p_odds,p_size,p_meta);
  return jsonb_build_object('ok',true);
end;$function$;

-- ── app_transfer (SOUND) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_transfer(p_ref text, p_from text, p_to text, p_amount numeric)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_from accounts%rowtype; v_to accounts%rowtype; v_cust text; v_name text; v_bal numeric;
begin
  if v_uid is null then return json_build_object('ok',false,'error','not authenticated'); end if;
  if p_amount is null or p_amount <= 0 then return json_build_object('ok',false,'error','amount must be positive'); end if;
  if p_from = p_to then return json_build_object('ok',false,'error','same account'); end if;
  if p_ref is null or length(p_ref) < 6 then return json_build_object('ok',false,'error','bad ref'); end if;
  if exists (select 1 from requests where local_id = p_ref) then return json_build_object('ok',true,'duplicate',true,'ref',p_ref); end if;
  select * into v_from from accounts where acct_no = p_from;
  select * into v_to from accounts where acct_no = p_to;
  if v_from.acct_no is null or v_to.acct_no is null then return json_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from players p where p.id = v_from.player_id and p.auth_id = v_uid)
     or not exists (select 1 from players p where p.id = v_to.player_id and p.auth_id = v_uid) then
    return json_build_object('ok',false,'error','not your account'); end if;
  select cust_id, name into v_cust, v_name from players where id = v_from.player_id;
  if v_from.server = 'crypto' then
    select coalesce((select qty from crypto_holdings where acct_no=p_from and asset='USDT'),0) into v_bal;
  else v_bal := coalesce(v_from.balance,0); end if;
  if v_bal < p_amount then return json_build_object('ok',false,'error','insufficient balance','balance',v_bal); end if;
  insert into requests(local_id,cust_id,name,acct_no,server,type,amount,net,from_label,to_label,status,decided_at)
    values (p_ref, v_cust, v_name, p_from, v_from.server, 'transfer', p_amount, p_amount, initcap(v_from.server), initcap(v_to.server), 'approved', now());
  if v_from.server = 'crypto' then
    update crypto_holdings set qty = round((qty - p_amount)::numeric, 8), updated_at = now() where acct_no = p_from and asset = 'USDT';
  else
    insert into ledger(acct_no,cust_id,server,kind,amount,ref) values (p_from, v_cust, v_from.server, 'transfer', -p_amount, p_ref||'-out');
  end if;
  if v_to.server = 'crypto' then
    insert into crypto_holdings(acct_no,asset,qty,updated_at) values (p_to,'USDT',p_amount,now())
      on conflict (acct_no,asset) do update set qty = round((crypto_holdings.qty + p_amount)::numeric,8), updated_at = now();
  else
    insert into ledger(acct_no,cust_id,server,kind,amount,ref) values (p_to, v_cust, v_to.server, 'transfer', p_amount, p_ref||'-in');
  end if;
  return json_build_object('ok',true,'ref',p_ref,'from',p_from,'to',p_to,'amount',p_amount);
end $function$;

-- ── cash_out (⚠ pays before claim — see header) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cash_out(p_local_id text, p_fraction numeric DEFAULT 1.0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
declare v_pos public.positions%rowtype; v_cust text; v_val numeric; v_frac numeric;
begin
  v_frac := case when p_fraction is null or p_fraction <= 0 then 1.0 when p_fraction > 1 then 1.0 else p_fraction end;
  select p.* into v_pos from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server='sports' and p.kind='bet' and p.status='open' and pl.auth_id = auth.uid() limit 1;
  if v_pos.local_id is null then return jsonb_build_object('ok', false, 'error', 'bet not found or already settled'); end if;
  v_cust := v_pos.cust_id;
  v_val := round( (coalesce(v_pos.stake,0) * 0.92) * v_frac, 2 );
  if v_val <= 0 then return jsonb_build_object('ok', false, 'error', 'nothing to cash out'); end if;
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (v_pos.acct_no, v_cust, 'sports', 'bet_cashout', v_val, 'cashout-'||p_local_id||'-'||to_char(now(),'YYYYMMDDHH24MISSMS'));
  if v_frac >= 1 then
    update public.positions set status='cashed' where local_id=p_local_id and cust_id=v_cust and server='sports' and status='open';
  else
    update public.positions set stake = round(stake*(1-v_frac),2), potential = round(potential*(1-v_frac),2)
      where local_id=p_local_id and cust_id=v_cust and server='sports' and status='open';
  end if;
  return jsonb_build_object('ok', true, 'amount', v_val);
end;$function$;

-- ── apply_ledger (the invariant: balance = opening + Σledger) ────────────────
CREATE OR REPLACE FUNCTION public.apply_ledger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
begin
  update accounts set balance = round((coalesce(balance,0) + new.amount)::numeric, 2) where acct_no = new.acct_no;
  return new;
end $function$;

-- ── admin_set_balance (SOUND — writes a corrective ledger row) ──────────────
CREATE OR REPLACE FUNCTION public.admin_set_balance(p_acct text, p_target numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_acct public.accounts%rowtype; v_cust text; v_delta numeric;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if p_target is null or p_target < 0 then return jsonb_build_object('ok',false,'error','bad target'); end if;
  select * into v_acct from public.accounts where acct_no = p_acct;
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if v_acct.server not in ('sports','fx') then return jsonb_build_object('ok',false,'error','sports/fx only'); end if;
  v_delta := round(p_target - coalesce(v_acct.balance,0), 2);
  if abs(v_delta) < 0.005 then return jsonb_build_object('ok',true,'noop',true,'balance',coalesce(v_acct.balance,0)); end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_acct, v_cust, v_acct.server, 'admin_adjust', v_delta, 'adminset-'||p_acct||'-'||to_char(now(),'YYYYMMDDHH24MISSMSUS'));
  return jsonb_build_object('ok',true,'delta',v_delta,'balance',p_target);
end;$function$;

-- ── admin_void_bet (SOUND — idempotent refund + claim-by-delete) ────────────
CREATE OR REPLACE FUNCTION public.admin_void_bet(p_local_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_pos public.positions%rowtype;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  select * into v_pos from public.positions where local_id = p_local_id and server='sports' and kind='bet' and status='open' limit 1;
  if v_pos.local_id is null then return jsonb_build_object('ok',false,'error','bet not found or already settled'); end if;
  if not exists (select 1 from public.ledger where ref = 'void-'||p_local_id) then
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (v_pos.acct_no, v_pos.cust_id, 'sports', 'bet_void', coalesce(v_pos.stake,0), 'void-'||p_local_id);
  end if;
  delete from public.positions where local_id = p_local_id and server='sports' and status='open';
  return jsonb_build_object('ok',true,'refunded',coalesce(v_pos.stake,0),'acct',v_pos.acct_no);
end;$function$;

-- ── withdraw_hold (SOUND — sports-only, idempotent) ─────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_hold(p_id text, p_acct text, p_amount numeric, p_fee numeric DEFAULT 0, p_asset text DEFAULT 'USDT'::text, p_network text DEFAULT ''::text, p_address text DEFAULT ''::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text; v_net numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  select a.* into v_acct from public.accounts a join public.players pl on pl.id = a.player_id where a.acct_no = p_acct and pl.auth_id = v_uid;
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if v_acct.server <> 'sports' then return jsonb_build_object('ok',false,'error','withdraw_hold is sports-only'); end if;
  if exists (select 1 from public.ledger where ref = 'wdhold-'||p_id) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  if coalesce(v_acct.balance,0) < p_amount then return jsonb_build_object('ok',false,'error','insufficient balance','balance',coalesce(v_acct.balance,0)); end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;
  v_net := round(p_amount - coalesce(p_fee,0), 2);
  insert into public.requests(local_id, cust_id, acct_no, server, type, amount, fee, net, asset, network, address, status)
    values (p_id, v_cust, p_acct, v_acct.server, 'withdraw', p_amount, coalesce(p_fee,0), v_net, p_asset, p_network, p_address, 'pending');
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_acct, v_cust, v_acct.server, 'withdraw_hold', -p_amount, 'wdhold-'||p_id);
  return jsonb_build_object('ok',true,'held',p_amount,'net',v_net);
end;$function$;

-- ── NOTE ─────────────────────────────────────────────────────────────────────
-- The full set (crypto_trade, swap_crypto, stake_crypto, unstake_crypto,
-- sync_crypto_balance, fx_open, fx_close, withdrawable_for, the apply_* /
-- guard_* / on_withdraw_decision / pay_referral / redeem_referral /
-- seed_crypto_welcome_stake triggers, is_admin / owns_acct / owns_cust, etc.)
-- was reviewed in the same dump and verified to follow the contract (ownership +
-- idempotency + server pricing). They are managed by their own files in this
-- directory (crypto_*.sql, fx_*.sql, withdraw_*.sql, welcome_bonus.sql,
-- redeem_referral.sql, accounts_lock.sql, compliance_guard.sql,
-- responsible_gaming.sql). This snapshot focuses on the previously-uncommitted
-- money RPCs (place_bet/app_transfer/cash_out/admin_*/withdraw_hold) + the
-- balance trigger, and records the place_bet odds-validation gap.
