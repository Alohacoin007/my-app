-- Alpexa — bonus is NON-TRANSFERABLE (#24). Server-enforced.
--
-- Bug: app_transfer only checked `balance < amount` (full balance), never accounts.bonus.
-- A user could move the non-withdrawable welcome bonus sports/fx → crypto, then withdraw it
-- from crypto (which has no bonus lock) — bypassing guard_withdraw_request entirely.
--
-- Fix: cap the outbound amount from sports/fx at the withdrawable = max(0, balance − bonus),
-- so the welcome bonus stays stuck on its originating account and only real money (deposits
-- + winnings) can leave. Transfer-then-withdraw now equals direct-withdraw.
--
-- Deploy: run this whole file in the Supabase SQL editor (CREATE OR REPLACE, idempotent).
-- (No schema change — accounts.bonus already exists from withdraw_guard.sql.)

CREATE OR REPLACE FUNCTION public.app_transfer(p_ref text, p_from text, p_to text, p_amount numeric)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_from accounts%rowtype; v_to accounts%rowtype; v_cust text; v_name text; v_bal numeric; v_transferable numeric;
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
  -- Bonus is NON-TRANSFERABLE (#24): keep the welcome bonus on its sports/fx account.
  if v_from.server in ('sports','fx') then
    v_transferable := greatest(0, round((coalesce(v_from.balance,0) - coalesce(v_from.bonus,0))::numeric, 2));
    if p_amount > v_transferable then
      return json_build_object('ok',false,
        'error','Amount exceeds transferable balance — the welcome bonus is non-transferable',
        'transferable',v_transferable,'bonus',coalesce(v_from.bonus,0));
    end if;
  end if;
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
