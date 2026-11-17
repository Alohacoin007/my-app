-- 운영 DB 에 실제로 배포돼 있던 crypto_trade — 2026-11-17 사장님이 SQL editor 에서
--   select pg_get_functiondef('public.crypto_trade(text,text,text,numeric,text,numeric,boolean)'::regprocedure);
-- 로 뽑아 준 결과 그대로 (한 글자도 손대지 않음). 본문 md5(공백 제거) = 30fce10bac44ee7e4c2fa6d21ac5e6a7
-- = crypto_pending.sql 의 배포 전 가드가 운영에서 보고한 값.
-- 리포의 supabase/sql/crypto_trade.sql 과의 차이는 **주석 9줄뿐**(로직 동일) — tests/crypto-pending-sql.test.js 가 핀.
-- 이 파일은 테스트 자료다. 배포용이 아니다.
CREATE OR REPLACE FUNCTION public.crypto_trade(p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text, p_markup numeric DEFAULT 0, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_price numeric; v_pts timestamptz; v_cash numeric; v_have numeric;
        v_qty numeric; v_net numeric; v_fee numeric; v_gross numeric; v_mk numeric;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not p_all and (p_usd is null or p_usd <= 0) then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_side not in ('buy','sell') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if p_symbol = 'USDT' then return jsonb_build_object('ok',false,'error','cannot trade USDT'); end if;

  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id = v_acct.player_id and p.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your account');
  end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;

  if exists (select 1 from public.crypto_trades where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  select mid, updated_at into v_price, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_price is null or v_price <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- 하우스 마크업은 서버가 pricing_marks에서 읽는다 (2026-07-27 전수감사 — 클라 p_markup 무시).
  begin
    select greatest(0, least(50, coalesce(markup_pts, 0))) into v_mk
      from public.pricing_marks where symbol = p_symbol limit 1;
  exception when others then v_mk := 0; end;
  v_mk := coalesce(v_mk, 0);

  if p_side = 'buy' then
    select coalesce(qty,0) into v_cash from public.crypto_holdings where acct_no = p_acct and asset = 'USDT';
    if coalesce(v_cash,0) < p_usd then return jsonb_build_object('ok',false,'error','insufficient balance','balance',coalesce(v_cash,0)); end if;
    v_fee   := round(p_usd * (v_mk / 100.0), 2);
    v_net   := p_usd - v_fee;
    v_qty   := round((v_net / v_price)::numeric, 8);
    v_gross := p_usd;
  else
    select coalesce(qty,0) into v_have from public.crypto_holdings where acct_no = p_acct and asset = p_symbol;
    if p_all then
      v_qty := round(coalesce(v_have,0), 8);
    else
      v_qty := round((p_usd / v_price)::numeric, 8);
    end if;
    if v_qty <= 0 then return jsonb_build_object('ok',false,'error','nothing to sell'); end if;
    if coalesce(v_have,0) < v_qty - 1e-9 then return jsonb_build_object('ok',false,'error','insufficient holdings','have',coalesce(v_have,0)); end if;
    v_gross := round((v_qty * v_price)::numeric, 2);
    v_fee   := round(v_gross * (v_mk / 100.0), 2);
    v_net   := v_gross - v_fee;
  end if;

  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_symbol, p_side, v_gross, v_qty, v_price, v_fee);

  if p_side = 'buy' then
    update public.crypto_holdings set qty = round((qty - p_usd)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = 'USDT';
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, p_symbol, v_qty, now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  else
    update public.crypto_holdings set qty = round((qty - v_qty)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = p_symbol;
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, 'USDT', round(v_net::numeric, 8), now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  end if;

  return jsonb_build_object('ok',true,'side',p_side,'qty',v_qty,'price',v_price,'fee',v_fee,'usd',v_gross,'net',v_net);
end;$function$
;
