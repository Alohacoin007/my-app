-- Alpexa — withdraw_hold RPC + reject-refund trigger  (server-authoritative withdrawals)
-- ============================================================================
-- Closes A7: today the client holds funds with a forgeable ledger delta
--   (sports-live.html:2846  balance-=v; syncSportsBal())  and refunds a rejected
--   withdrawal the same way (:2482). A modified client could skip the debit or
--   forge a refund. Move BOTH to the server:
--
--   • withdraw_hold(): ONE atomic transaction — verify ownership, check balance,
--     create the back-office request, and debit the ledger (idempotent wdhold-<id>).
--   • trg_withdraw_decision: when the back office flips a withdraw to 'rejected',
--     auto-refund via the ledger (idempotent wdrefund-<id>). No client credit.
--
-- Invariant: a withdrawal only ever moves money through the server. The client
--   can neither hold nor refund its own balance.
-- Works for balance-backed servers (sports, fx). Crypto withdraws debit
--   crypto_holdings and are handled separately.
-- ============================================================================

-- ① HOLD: atomic balance check + request + debit (idempotent on p_id)
create or replace function public.withdraw_hold(
  p_id text, p_acct text, p_amount numeric, p_fee numeric default 0,
  p_asset text default 'USDT', p_network text default '', p_address text default ''
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text; v_net numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok',false,'error','bad amount'); end if;

  -- ownership: this account belongs to the signed-in user
  select a.* into v_acct from public.accounts a
    join public.players pl on pl.id = a.player_id
   where a.acct_no = p_acct and pl.auth_id = v_uid;
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  -- SPORTS ONLY: sports has NO server-side withdraw trigger, so the hold here is the
  -- sole debit. FX/crypto already debit on APPROVAL (apply_fx_withdraw_balance /
  -- apply_crypto_withdraw_holding) — holding here too would double-debit them.
  if v_acct.server <> 'sports' then
    return jsonb_build_object('ok',false,'error','withdraw_hold is sports-only'); end if;

  -- idempotent: same withdrawal id can't double-hold (ledger.ref is UNIQUE)
  if exists (select 1 from public.ledger where ref = 'wdhold-'||p_id) then
    return jsonb_build_object('ok',true,'duplicate',true); end if;

  if coalesce(v_acct.balance,0) < p_amount then
    return jsonb_build_object('ok',false,'error','insufficient balance','balance',coalesce(v_acct.balance,0)); end if;

  select cust_id into v_cust from public.players where id = v_acct.player_id;
  v_net := round(p_amount - coalesce(p_fee,0), 2);

  -- back-office request (so the operator sees it) + the debit, atomically
  insert into public.requests(local_id, cust_id, acct_no, server, type, amount, fee, net, asset, network, address, status)
    values (p_id, v_cust, p_acct, v_acct.server, 'withdraw', p_amount, coalesce(p_fee,0), v_net,
            p_asset, p_network, p_address, 'pending');

  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (p_acct, v_cust, v_acct.server, 'withdraw_hold', -p_amount, 'wdhold-'||p_id);

  return jsonb_build_object('ok',true,'held',p_amount,'net',v_net);
end;$$;


-- ② REFUND on reject: when a withdraw request flips to 'rejected', credit the
--    held funds back via the ledger. Idempotent (wdrefund-<id>), server-only.
create or replace function public.on_withdraw_decision()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- Refund ONLY if this withdrawal was actually held by withdraw_hold (sports).
  -- FX/crypto debit on APPROVAL, so a rejected FX/crypto withdraw never debited →
  -- nothing to refund. The wdhold-<id> existence check makes this safe for all servers.
  if NEW.type = 'withdraw' and NEW.status = 'rejected'
     and coalesce(OLD.status,'') is distinct from 'rejected'
     and exists (select 1 from public.ledger where ref = 'wdhold-'||NEW.local_id)
     and not exists (select 1 from public.ledger where ref = 'wdrefund-'||NEW.local_id) then
    insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
      values (NEW.acct_no, NEW.cust_id, NEW.server, 'withdraw_refund',
              coalesce(NEW.amount,0), 'wdrefund-'||NEW.local_id);
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_withdraw_decision on public.requests;
create trigger trg_withdraw_decision
  after update on public.requests
  for each row execute function public.on_withdraw_decision();

-- NOTE (approval): on 'approved' the hold IS the debit — do NOT debit again.
--   The back office must NOT subtract balance on approve; it just marks it sent.
