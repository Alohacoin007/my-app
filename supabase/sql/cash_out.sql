-- Alpexa — cash_out RPC (server-center, safe by construction)
-- Cashes out an OPEN sports bet (full or partial). Server computes + caps the
-- value at 92% of the (remaining) stake, so it can NEVER pay more than staked
-- (no over-pay / fraud). Credits the ledger (trigger updates the balance) and
-- removes/reduces the position. Any client (app or desktop) calls this.
create or replace function public.cash_out(p_local_id text, p_fraction numeric default 1.0)
returns jsonb language plpgsql security definer as $$
declare v_pos public.positions%rowtype; v_cust text; v_val numeric; v_frac numeric;
begin
  v_frac := case when p_fraction is null or p_fraction <= 0 then 1.0
                 when p_fraction > 1 then 1.0 else p_fraction end;
  -- find THIS caller's open bet
  select p.* into v_pos
    from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players  pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server='sports' and p.kind='bet' and p.status='open'
     and pl.auth_id = auth.uid()
   limit 1;
  if v_pos.local_id is null then
    return jsonb_build_object('ok', false, 'error', 'bet not found or already settled');
  end if;
  select cust_id into v_cust from public.accounts where acct_no = v_pos.acct_no;
  -- conservative, capped value: 92% of remaining stake (always <= stake)
  v_val := round( (coalesce(v_pos.stake,0) * 0.92) * v_frac, 2 );
  if v_val <= 0 then return jsonb_build_object('ok', false, 'error', 'nothing to cash out'); end if;
  -- credit the cashout (trigger applies it to accounts.balance)
  insert into public.ledger(acct_no, cust_id, server, kind, amount, ref)
    values (v_pos.acct_no, v_cust, 'sports', 'bet_cashout', v_val,
            'cashout-'||p_local_id||'-'||to_char(now(),'YYYYMMDDHH24MISSMS'));
  if v_frac >= 1 then
    update public.positions set status='cashed'
      where local_id=p_local_id and cust_id=v_cust and server='sports' and status='open';
  else
    update public.positions
       set stake = round(stake*(1-v_frac),2), potential = round(potential*(1-v_frac),2)
      where local_id=p_local_id and cust_id=v_cust and server='sports' and status='open';
  end if;
  return jsonb_build_object('ok', true, 'amount', v_val);
end;$$;
