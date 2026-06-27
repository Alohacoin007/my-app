-- Alpexa — D12 FIX (DRAFT — TEST BEFORE PROD): place_bet re-prices every leg from
-- the SERVER lines (live_games), ignoring client-submitted odds. This closes the
-- money-printing hole where a modified client could send inflated leg odds and be
-- paid on them (sports-settle pays stake × Π(meta.legs[].am), and meta came from
-- the client). After this, meta.legs[].am is SERVER-stamped, so settlement is safe.
--
-- Algorithm proven in tests/place-bet-odds.test.js (re-price, SGP haircut, fail-safe).
--
-- ⚠️ DEPLOY CAREFULLY — this is the core bet path. A wrong JSON field would reject
--    all bets. Test plan (run on a real session BEFORE trusting it):
--      1) place a normal single → succeeds, payout matches the displayed line.
--      2) place a 2-leg same-game (SGP) → payout reflects the 25% haircut.
--      3) call place_bet directly with meta.legs[].am inflated (e.g. 100000) →
--         the stored potential + meta.legs[].am must be the SERVER odds, NOT 100000.
--      4) a selection not currently offered → rejected ('line not offered').
--    Keep the OLD place_bet handy to roll back if any legit bet is wrongly rejected.
--
-- Assumptions (verified in the app/feed code, re-confirm against live data):
--   • live_games row id='all', data = jsonb array; each game has gid + ml/spread/total
--     arrays of {sel, am, ln}. The app renders from this SAME row, so leg.sel == the
--     server entry's sel and leg.market ∈ ('ml','spread','total').
--   • Player props are NOT in live_games → rejected here (can't be server-validated).
--     If props go live for real money, add their server odds source and allow-list them.
--   • SGP_HAIRCUT must match sports-live.html + sports-settle (0.25).
-- ============================================================================

create or replace function public.place_bet(
  p_acct text, p_stake numeric, p_potential numeric, p_symbol text, p_local_id text,
  p_meta jsonb, p_game text default '', p_pick text default '', p_odds numeric default 0, p_size integer default 1
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_player uuid; v_cust text; v_bal numeric;
  v_games jsonb; v_legs jsonb; v_leg jsonb; v_game jsonb;
  v_gid text; v_mk text; v_sel text; v_srv_am numeric; v_dec numeric;
  v_combo numeric := 1; v_nlegs int := 0; v_gid0 text; v_all_same boolean := true;
  v_new_legs jsonb := '[]'::jsonb; v_potential numeric;
  c_haircut constant numeric := 0.25;
begin
  -- 1) ownership
  select player_id into v_player from accounts where acct_no=p_acct and server='sports';
  if v_player is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists(select 1 from players where id=v_player and auth_id=auth.uid()) then
    return jsonb_build_object('ok',false,'error','not your account'); end if;
  select cust_id into v_cust from players where id=v_player;

  -- 2) idempotency
  if exists(select 1 from positions where cust_id=v_cust and server='sports' and local_id=p_local_id) then
    return jsonb_build_object('ok',true,'duplicate',true); end if;

  -- 3) basic stake
  if p_stake is null or p_stake <= 0 then return jsonb_build_object('ok',false,'error','bad stake'); end if;

  -- 4) RE-PRICE from the server lines (client odds ignored). Fail safe: any leg that
  --    can't be matched to a current server line aborts the whole bet.
  select data into v_games from live_games where id='all';
  if v_games is null then return jsonb_build_object('ok',false,'error','odds unavailable'); end if;
  v_legs := coalesce(p_meta->'legs','[]'::jsonb);
  if jsonb_typeof(v_legs) <> 'array' or jsonb_array_length(v_legs) < 1 then
    return jsonb_build_object('ok',false,'error','no legs'); end if;

  for v_leg in select value from jsonb_array_elements(v_legs) loop
    v_gid := v_leg->>'gid'; v_mk := v_leg->>'market'; v_sel := v_leg->>'sel';
    if v_mk not in ('ml','spread','total') then
      return jsonb_build_object('ok',false,'error','market not offered: '||coalesce(v_mk,'?')); end if;
    select g.value into v_game from jsonb_array_elements(v_games) g where g.value->>'gid' = v_gid limit 1;
    if v_game is null then return jsonb_build_object('ok',false,'error','game not available'); end if;
    select (e.value->>'am')::numeric into v_srv_am
      from jsonb_array_elements(v_game->v_mk) e where e.value->>'sel' = v_sel limit 1;
    if v_srv_am is null or v_srv_am = 0 then
      return jsonb_build_object('ok',false,'error','line not offered'); end if;
    v_dec := case when v_srv_am > 0 then 1 + v_srv_am/100.0 else 1 + 100.0/(-v_srv_am) end;
    v_combo := v_combo * v_dec; v_nlegs := v_nlegs + 1;
    if v_gid0 is null then v_gid0 := v_gid; elsif v_gid0 <> v_gid then v_all_same := false; end if;
    -- stamp SERVER odds into the stored leg (overwrite client am/am0) so settlement is safe
    v_new_legs := v_new_legs || jsonb_build_array(v_leg || jsonb_build_object('am', v_srv_am, 'am0', v_srv_am));
  end loop;

  -- SGP correlation haircut when all legs share one game (matches app + settle)
  if v_nlegs >= 2 and v_all_same then v_combo := 1 + (v_combo - 1) * (1 - c_haircut); end if;
  v_potential := round(p_stake * v_combo, 2);

  -- 5) balance
  select balance into v_bal from accounts where acct_no=p_acct and server='sports';
  if coalesce(v_bal,0) < p_stake then return jsonb_build_object('ok',false,'error','insufficient balance'); end if;

  -- 6) debit + record with SERVER-stamped meta + SERVER-computed potential
  insert into ledger(acct_no,cust_id,server,kind,amount,ref)
    values (p_acct,v_cust,'sports','bet',-p_stake,'betstake-'||p_local_id);
  insert into positions(cust_id,acct_no,server,kind,local_id,symbol,side,stake,potential,status,game,pick,odds,size,meta)
    values (v_cust,p_acct,'sports','bet',p_local_id,p_symbol,'',p_stake,v_potential,'open',p_game,p_pick,
            p_odds, p_size, jsonb_set(p_meta,'{legs}',v_new_legs));
  return jsonb_build_object('ok',true,'potential',v_potential,'legs',v_nlegs);
end;$function$;
