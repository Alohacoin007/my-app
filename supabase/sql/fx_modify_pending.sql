-- Alpexa — fx_modify_pending: set / clear SL·TP on the caller's OWN pending order (2026-09-21, 사장님 승인 "2 A")
-- =============================================================================================
-- Why: the Robinhood-style FX app (dev/trading-rh.html) takes SL/TP OFF the Limit/Stop order form
-- (사장님 2026-09-21 "리밋오더에서 스탑로쓰랑 테이크 프로핏 빼자 — 액티비티 페이지에서 넣게") and
-- sets them from Activity › Orders instead. fx_place_pending only accepts SL/TP at creation and
-- there was no server path to change them afterwards. This is that path.
--
-- Contract (mirrors fx_modify for open positions + fx_place_pending's trigger-relative checks):
--   • auth.uid() must own an FX account; the order must be THAT account's and status = 'pending'.
--     filled / cancelled / rejected rows are audit history — never touched.
--   • null = clear the level (same convention as fx_modify).
--   • Direction is validated against the order's TRIGGER (not the market): BUY → sl < trigger < tp,
--     SELL → tp < trigger < sl. Exactly the rule fx_place_pending enforces at creation, so a level
--     set here is one fx_place_pending would have accepted.
--   • Moves NO money. Writes only fx_pending.sl / fx_pending.tp. Execution stays with fx_pending_fill,
--     which copies sl/tp into the opened position's meta exactly as before (no engine change).
--   • Idempotent by construction (pure overwrite).
--
-- Deploy: paste whole file in Supabase SQL editor. Pin: tests/fx-modify-pending.test.js (source contract).
-- =============================================================================================

create or replace function public.fx_modify_pending(p_local_id text, p_sl numeric default null, p_tp numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_acct text; v_side text; v_trigger numeric; v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_sl is not null and p_sl <= 0 then return jsonb_build_object('ok',false,'error','bad SL'); end if;
  if p_tp is not null and p_tp <= 0 then return jsonb_build_object('ok',false,'error','bad TP'); end if;

  select a.acct_no into v_acct
    from public.accounts a join public.players pl on pl.id = a.player_id
   where a.server = 'fx' and pl.auth_id = v_uid limit 1;
  if v_acct is null then return jsonb_build_object('ok',false,'error','no fx account'); end if;

  select upper(side), trigger, status into v_side, v_trigger, v_status
    from public.fx_pending
   where local_id = p_local_id and acct_no = v_acct and server = 'fx'
   limit 1;
  if v_side is null then return jsonb_build_object('ok',false,'error','order not found'); end if;
  if v_status <> 'pending' then return jsonb_build_object('ok',false,'error','order is '||v_status,'code','NOT_PENDING'); end if;

  -- 트리거 기준 방향 검증 (fx_place_pending 과 자구 동일: BUY sl<trigger<tp · SELL tp<trigger<sl)
  if p_sl is not null and ((v_side='BUY' and p_sl >= v_trigger) or (v_side='SELL' and p_sl <= v_trigger)) then
    return jsonb_build_object('ok',false,'error','SL on wrong side of trigger'); end if;
  if p_tp is not null and ((v_side='BUY' and p_tp <= v_trigger) or (v_side='SELL' and p_tp >= v_trigger)) then
    return jsonb_build_object('ok',false,'error','TP on wrong side of trigger'); end if;

  update public.fx_pending set sl = p_sl, tp = p_tp
   where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'pending';
  return jsonb_build_object('ok',true,'local_id',p_local_id,'sl',p_sl,'tp',p_tp);
end;$function$;
revoke all on function public.fx_modify_pending(text,numeric,numeric) from public, anon;
grant execute on function public.fx_modify_pending(text,numeric,numeric) to authenticated;
