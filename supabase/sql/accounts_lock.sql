-- Alpexa — accounts UPDATE lock (close A6) + server-computed crypto balance mirror
-- ============================================================================
-- A6: accounts_upd policy allowed the OWNER to UPDATE their own row, so a player
-- could `accounts.update({balance: 1e6})` and set any balance DIRECTLY — bypassing
-- the (now-locked) ledger entirely, then withdraw against the fake balance. This
-- defeats the whole sports/fx closure.
--
-- Fix: lock accounts UPDATE to admin/SECURITY-DEFINER only. The only legit client
-- UPDATE was the crypto app pushing its holdings-total into accounts.balance(crypto)
-- for the back-office display (crypto-live.html:1778). Replace that direct write with
-- sync_crypto_balance(): the SERVER recomputes the value from crypto_holdings ×
-- prices (+ stakes) — owner can trigger it but can't forge the number.
-- ============================================================================

-- ① Server-computed crypto balance mirror (owner may trigger; server decides value).
create or replace function public.sync_crypto_balance(p_acct text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_val numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not exists (select 1 from public.accounts a join public.players pl on pl.id = a.player_id
                 where a.acct_no = p_acct and a.server = 'crypto' and pl.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your crypto account'); end if;

  -- value = Σ(holdings qty × server price; USDT=1) + Σ(staked usd)
  select coalesce(sum(case when h.asset = 'USDT' then h.qty else h.qty * coalesce(pr.mid,0) end), 0)
    into v_val
    from public.crypto_holdings h
    left join public.prices pr on pr.symbol = h.asset
   where h.acct_no = p_acct;
  v_val := v_val + coalesce((select sum(usd) from public.crypto_stakes where acct_no = p_acct), 0);

  update public.accounts set balance = round(v_val, 2) where acct_no = p_acct and server = 'crypto';
  return jsonb_build_object('ok',true,'balance',round(v_val,2));
end;$$;

-- ② LOCK accounts UPDATE to admin only (SECURITY DEFINER RPCs bypass RLS regardless:
--    place_bet/cash_out/app_transfer/withdraw_hold/admin_*/sync_crypto_balance + the
--    ledger & settlement balance triggers). Keep SELECT/INSERT/DELETE as they were.
drop policy if exists accounts_upd on public.accounts;
create policy accounts_upd on public.accounts
  for update using (public.is_admin()) with check (public.is_admin());
