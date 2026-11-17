-- Alpexa — 크립토 지정가·스탑 주문 (서버 대기주문) v1   (2026-11-17 사장님 "크립토 지정가 진행해")
-- ============================================================================================
-- 지금까지 크립토는 시장가(crypto_trade)만 있었다. 지정가·스탑은 폰에만 저장되고 아무도 체결하지 않아
-- 2026-11-15 에 화면에서 숨겼다. 이 파일이 그 주문을 **서버로** 옮긴다:
--   crypto_place_pending / crypto_cancel_pending (고객 RPC) + crypto_pending_fill (1분 크론 스윕)
--
-- 불변식 (돈):
--  ① 체결 엔진은 한 곳 — crypto_fill_internal. 시장가(crypto_trade)와 대기주문 스윕이 **같은 코어**를 부른다
--     (가격·신선도 120초·수수료·잔고 확인·holdings 이동이 자구 동일). FX 의 fx_fill_internal 과 같은 구조.
--     crypto_trade 는 본인 확인만 하는 얇은 래퍼가 된다 — 시장가의 동작·응답은 그대로다
--     (tests/crypto-pending-sql.test.js 가 옛 함수와 새 함수를 같은 시나리오로 돌려 결과가 같음을 실제 DB 로 증명).
--  ② 이중 체결 구조적 불가 — 주문 id = 체결 ref (crypto_trades PK). 스윕이 같은 주문을 두 번 봐도 두 번째는 duplicate(돈 0).
--     스윕은 행을 잠그고(for update skip locked) 체결과 상태 변경을 같은 트랜잭션에서 한다.
--  ③ 잔고는 **체결 순간에** 확인한다 (주문을 걸 때 돈을 묶지 않는다 — FX 대기주문과 같음, 사장님 승인).
--     체결 순간 잔고·보유가 모자라면 그 주문은 'rejected' + 사유 (조용히 사라지지 않는다).
--  ④ fail-safe: 시세 없음 / 120초 넘게 낡음 → 그 주문은 건너뛴다 (돈은 추측으로 안 움직인다). 다음 분에 다시 본다.
--  ⑤ 앱은 crypto_pending 에 쓰지 못한다 (RLS: 본인 것 읽기만). 접수·취소·체결 전부 SECURITY DEFINER 함수.
--
-- 트리거 판정 (크립토 체결가 = 서버 mid, crypto_trade 와 같음):
--   BUY  LIMIT : mid ≤ trigger      SELL LIMIT : mid ≥ trigger
--   BUY  STOP  : mid ≥ trigger      SELL STOP  : mid ≤ trigger
--   ∴ LIMIT 은 지정가보다 불리하게 체결될 수 없다 (체결가 = 그 순간 mid, 조건이 곧 "지정가보다 유리").
--   v1 한계: 판정은 1분마다 그 순간의 가격으로 한다. 1분 사이에 가격이 스치고 돌아가면 체결되지 않는다.
--
-- 수량 단위: BUY = 쓸 달러(usd) · SELL = 팔 코인 수량(qty).
--   (SELL 을 달러로 받으면 가격이 내려간 뒤 스탑이 "보유 부족"으로 거절된다 — 손절 주문이 손절을 못 한다.)
--
-- 선행: crypto_trade.sql 배포 상태 (crypto_trades · prices.updated_at · crypto_trade 7인자).
-- 배포: 이 파일 **전체**를 Supabase SQL editor 에 붙여넣고 1회 실행 (재실행 안전). 수동 — 돈 SQL.
--       맨 위 가드가 "지금 배포된 crypto_trade 가 리포와 같은지" 먼저 확인한다. 다르면 아무것도 바꾸지 않고 멈춘다.
-- 되돌리기: 맨 아래 주석.
-- ============================================================================================

-- 0) 배포 전 가드 — 배포된 crypto_trade 본문이 (a) 리포의 crypto_trade.sql 또는 (b) 이 파일의 새 래퍼와 같아야 한다.
--    다르면 = 누군가 SQL editor 에서 직접 고친 것 → 이 파일이 그 수정을 덮어쓰게 되므로 중단한다. (공백 차이는 무시)
do $guard$
declare v_src text; v_h text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crypto_trade'
     and pg_get_function_identity_arguments(p.oid) = 'p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text, p_markup numeric, p_all boolean';
  if v_src is null then
    raise exception 'crypto_pending: crypto_trade(7 args) not found — deploy crypto_trade.sql first. Nothing was changed.';
  end if;
  v_h := md5(regexp_replace(v_src, '\s+', '', 'g'));
  if v_h not in ('97da35b76e27189e0c55a63663544217', '7149798288d40b21e6531b6f5cd80491') then
    raise exception 'crypto_pending: deployed crypto_trade differs from the repo (md5 %). Stopped — nothing was changed.', v_h;
  end if;
end $guard$;

-- 1) 체결 코어 — crypto_trade 의 "본인 확인 뒤" 본문을 그대로 옮긴 것. 추가는 p_qty(SELL 수량 지정) 하나뿐이고,
--    시장가 래퍼는 p_qty 를 넘기지 않으므로 시장가 경로는 자구 동일하다.
--    직접 호출 금지(아래 revoke) — 본인 확인이 없다. 부르는 곳은 crypto_trade 와 crypto_pending_fill 둘뿐.
create or replace function public.crypto_fill_internal(
  p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text,
  p_all boolean default false, p_qty numeric default null
) returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_acct public.accounts%rowtype; v_cust text;
        v_price numeric; v_pts timestamptz; v_cash numeric; v_have numeric;
        v_qty numeric; v_net numeric; v_fee numeric; v_gross numeric; v_mk numeric;
begin
  if p_qty is not null and (p_qty <= 0 or p_side is distinct from 'sell') then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if not p_all and p_qty is null and (p_usd is null or p_usd <= 0) then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_side not in ('buy','sell') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if p_symbol = 'USDT' then return jsonb_build_object('ok',false,'error','cannot trade USDT'); end if;

  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;

  -- idempotent: same ref never double-applies
  if exists (select 1 from public.crypto_trades where ref = p_ref) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  -- SERVER price + freshness (reject if missing or older than 120s = feed frozen)
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
  else  -- sell
    select coalesce(qty,0) into v_have from public.crypto_holdings where acct_no = p_acct and asset = p_symbol;
    if p_all then
      v_qty := round(coalesce(v_have,0), 8);                 -- liquidate the whole position
    elsif p_qty is not null then
      v_qty := round(p_qty, 8);                              -- 대기주문 SELL: 코인 수량 지정
    else
      v_qty := round((p_usd / v_price)::numeric, 8);
    end if;
    if v_qty <= 0 then return jsonb_build_object('ok',false,'error','nothing to sell'); end if;
    if coalesce(v_have,0) < v_qty - 1e-9 then return jsonb_build_object('ok',false,'error','insufficient holdings','have',coalesce(v_have,0)); end if;
    v_gross := round((v_qty * v_price)::numeric, 2);
    v_fee   := round(v_gross * (v_mk / 100.0), 2);
    v_net   := v_gross - v_fee;
  end if;

  -- lock FIRST (idempotency), then move holdings — mirrors app_transfer's order.
  insert into public.crypto_trades(ref,cust_id,acct_no,asset,side,usd,qty,price,fee)
    values (p_ref, v_cust, p_acct, p_symbol, p_side, v_gross, v_qty, v_price, v_fee);

  if p_side = 'buy' then
    update public.crypto_holdings set qty = round((qty - p_usd)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = 'USDT';
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, p_symbol, v_qty, now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  else  -- sell
    update public.crypto_holdings set qty = round((qty - v_qty)::numeric, 8), updated_at = now()
      where acct_no = p_acct and asset = p_symbol;
    insert into public.crypto_holdings(acct_no, asset, qty, updated_at)
      values (p_acct, 'USDT', round(v_net::numeric, 8), now())
      on conflict (acct_no, asset) do update set qty = round((public.crypto_holdings.qty + excluded.qty)::numeric, 8), updated_at = now();
  end if;

  return jsonb_build_object('ok',true,'side',p_side,'qty',v_qty,'price',v_price,'fee',v_fee,'usd',v_gross,'net',v_net);
end;$$;
revoke all on function public.crypto_fill_internal(text,text,text,numeric,text,boolean,numeric) from public, anon, authenticated;

-- 2) 시장가 RPC — 본인 확인만 하고 코어를 부른다. 시그니처·오류 순서·응답은 종전과 같다.
create or replace function public.crypto_trade(
  p_ref text, p_acct text, p_symbol text, p_usd numeric, p_side text,
  p_markup numeric default 0, p_all boolean default false
) returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if not p_all and (p_usd is null or p_usd <= 0) then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if p_side not in ('buy','sell') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if p_symbol = 'USDT' then return jsonb_build_object('ok',false,'error','cannot trade USDT'); end if;

  -- ownership: this crypto account belongs to the signed-in user
  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id = v_acct.player_id and p.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your account');
  end if;

  -- 체결은 코어 한 곳 (p_markup 은 하위호환용 — 종전처럼 무시. 수수료율은 서버 pricing_marks)
  return public.crypto_fill_internal(p_ref, p_acct, p_symbol, p_usd, p_side, p_all, null);
end;$$;

-- 3) 대기주문 테이블 — 앱은 읽기만 (본인 것). 쓰기 정책 없음 = 함수로만.
create table if not exists public.crypto_pending (
  id         text primary key,                 -- 앱이 만든 주문 id (= 체결 시 crypto_trades.ref)
  cust_id    text,
  acct_no    text not null,
  asset      text not null,
  side       text not null check (side in ('buy','sell')),
  otype      text not null check (otype in ('limit','stop')),
  usd        numeric check (usd is null or usd > 0),      -- BUY: 쓸 달러
  qty        numeric check (qty is null or qty > 0),      -- SELL: 팔 코인 수량
  trigger    numeric not null check (trigger > 0),
  status     text not null default 'pending' check (status in ('pending','filled','cancelled','rejected')),
  reason     text,
  fill_price numeric,
  fill_qty   numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  filled_at  timestamptz,
  check ((side = 'buy' and usd is not null and qty is null) or (side = 'sell' and qty is not null and usd is null))
);
create index if not exists crypto_pending_open_idx on public.crypto_pending (created_at) where status = 'pending';
create index if not exists crypto_pending_acct_idx on public.crypto_pending (acct_no, created_at desc);
alter table public.crypto_pending enable row level security;
drop policy if exists crypto_pending_read on public.crypto_pending;
create policy crypto_pending_read on public.crypto_pending
  for select using (public.is_admin() OR public.owns_acct(acct_no));
revoke insert, update, delete on public.crypto_pending from anon, authenticated;

-- 4) 접수 — 본인 계좌 · 신선한 시세 기준 방향 검증 · 계좌당 대기 20건 상한. 돈은 움직이지 않는다.
create or replace function public.crypto_place_pending(
  p_id text, p_acct text, p_symbol text, p_side text, p_otype text, p_trigger numeric,
  p_usd numeric default null, p_qty numeric default null
) returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_acct public.accounts%rowtype; v_cust text;
        v_side text := lower(coalesce(p_side,'')); v_ot text := lower(coalesce(p_otype,''));
        v_mid numeric; v_pts timestamptz; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  if p_id is null or p_id !~ '^cp-[A-Za-z0-9-]{6,40}$' then return jsonb_build_object('ok',false,'error','bad id'); end if;
  if v_side not in ('buy','sell') then return jsonb_build_object('ok',false,'error','bad side'); end if;
  if v_ot not in ('limit','stop') then return jsonb_build_object('ok',false,'error','bad type'); end if;
  if p_symbol is null or p_symbol = 'USDT' then return jsonb_build_object('ok',false,'error','cannot trade USDT'); end if;
  if p_trigger is null or p_trigger <= 0 then return jsonb_build_object('ok',false,'error','bad trigger'); end if;
  if v_side = 'buy'  and (p_usd is null or p_usd <= 0 or p_qty is not null) then return jsonb_build_object('ok',false,'error','bad amount'); end if;
  if v_side = 'sell' and (p_qty is null or p_qty <= 0 or p_usd is not null) then return jsonb_build_object('ok',false,'error','bad amount'); end if;

  -- ownership (crypto_trade 와 같은 검사)
  select * into v_acct from public.accounts where acct_no = p_acct and server = 'crypto';
  if v_acct.acct_no is null then return jsonb_build_object('ok',false,'error','account not found'); end if;
  if not exists (select 1 from public.players p where p.id = v_acct.player_id and p.auth_id = v_uid) then
    return jsonb_build_object('ok',false,'error','not your account');
  end if;
  select cust_id into v_cust from public.players where id = v_acct.player_id;

  -- 멱등: 같은 id 로 다시 오면 (더블탭·재시도) 새 주문을 만들지 않는다. 남의 id · 이미 체결에 쓰인 id 는 거절.
  if exists (select 1 from public.crypto_pending where id = p_id and acct_no = p_acct) then
    return jsonb_build_object('ok',true,'duplicate',true,'id',p_id);
  end if;
  if exists (select 1 from public.crypto_pending where id = p_id) or exists (select 1 from public.crypto_trades where ref = p_id) then
    return jsonb_build_object('ok',false,'error','bad id');
  end if;

  -- 신선한 서버 시세 기준으로 방향 검증 (이미 조건을 넘은 주문 = 즉시 체결될 주문 → 시장가를 쓰게 한다)
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||p_symbol); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;
  if (v_side = 'buy'  and v_ot = 'limit' and p_trigger >= v_mid)
  or (v_side = 'sell' and v_ot = 'limit' and p_trigger <= v_mid)
  or (v_side = 'buy'  and v_ot = 'stop'  and p_trigger <= v_mid)
  or (v_side = 'sell' and v_ot = 'stop'  and p_trigger >= v_mid) then
    return jsonb_build_object('ok',false,'error','trigger on wrong side of market','code','WRONG_SIDE','mid',v_mid);
  end if;

  select count(*) into v_n from public.crypto_pending where acct_no = p_acct and status = 'pending';
  if v_n >= 20 then return jsonb_build_object('ok',false,'error','too many pending orders','code','TOO_MANY','max',20); end if;

  insert into public.crypto_pending(id, cust_id, acct_no, asset, side, otype, usd, qty, trigger)
    values (p_id, v_cust, p_acct, p_symbol, v_side, v_ot,
            case when v_side = 'buy' then p_usd end, case when v_side = 'sell' then p_qty end, p_trigger);
  return jsonb_build_object('ok',true,'id',p_id,'status','pending');
end;$$;
revoke all on function public.crypto_place_pending(text,text,text,text,text,numeric,numeric,numeric) from public, anon;
grant execute on function public.crypto_place_pending(text,text,text,text,text,numeric,numeric,numeric) to authenticated;

-- 5) 취소 — 본인의 pending 주문만. 스윕이 그 행을 체결 중이면 잠금이 풀릴 때까지 기다렸다가 상태를 다시 본다
--    (이미 체결됐으면 취소되지 않는다 — "체결됐는데 취소됨"은 표현 불가능).
create or replace function public.crypto_cancel_pending(p_id text)
returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_done text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;
  update public.crypto_pending cp
     set status = 'cancelled', updated_at = now()
   where cp.id = p_id and cp.status = 'pending'
     and exists (select 1 from public.accounts a join public.players pl on pl.id = a.player_id
                  where a.acct_no = cp.acct_no and a.server = 'crypto' and pl.auth_id = v_uid)
  returning cp.id into v_done;
  if v_done is null then return jsonb_build_object('ok',false,'error','order not found or not pending','code','NOT_PENDING'); end if;
  return jsonb_build_object('ok',true,'id',v_done,'status','cancelled');
end;$$;
revoke all on function public.crypto_cancel_pending(text) from public, anon;
grant execute on function public.crypto_cancel_pending(text) to authenticated;

-- 6) 스윕 — 1분마다. pending 주문을 오래된 것부터 보고, 조건을 넘었으면 코어로 체결한다.
create or replace function public.crypto_pending_fill()
returns jsonb language plpgsql security definer
  set search_path to 'public' as $$
declare r public.crypto_pending%rowtype; v_mid numeric; v_pts timestamptz; v_hit boolean; v_res jsonb; v_err text;
        v_seen int := 0; v_filled int := 0; v_rejected int := 0; v_skipped int := 0; v_failed int := 0;
begin
  for r in select * from public.crypto_pending where status = 'pending' order by created_at, id for update skip locked loop
    v_seen := v_seen + 1;
    begin
      -- ④ fail-safe: 시세 없음·낡음 → 건너뛴다 (주문은 그대로 pending)
      select mid, updated_at into v_mid, v_pts from public.prices where symbol = r.asset limit 1;
      if v_mid is null or v_mid <= 0 or v_pts is null or (now() - v_pts) > interval '120 seconds' then
        v_skipped := v_skipped + 1; continue;
      end if;
      v_hit := case
        when r.side = 'buy'  and r.otype = 'limit' then v_mid <= r.trigger
        when r.side = 'sell' and r.otype = 'limit' then v_mid >= r.trigger
        when r.side = 'buy'  and r.otype = 'stop'  then v_mid >= r.trigger
        when r.side = 'sell' and r.otype = 'stop'  then v_mid <= r.trigger
        else false end;
      if not v_hit then continue; end if;

      -- ①② 체결은 코어 한 곳 · ref = 주문 id
      v_res := public.crypto_fill_internal(r.id, r.acct_no, r.asset, r.usd, r.side, false, r.qty);
      if coalesce((v_res->>'ok')::boolean, false) then
        update public.crypto_pending cp
           set status = 'filled', filled_at = now(), updated_at = now(),
               fill_price = coalesce((v_res->>'price')::numeric, (select t.price from public.crypto_trades t where t.ref = r.id)),
               fill_qty   = coalesce((v_res->>'qty')::numeric,   (select t.qty   from public.crypto_trades t where t.ref = r.id))
         where cp.id = r.id;
        v_filled := v_filled + 1;
      else
        v_err := coalesce(v_res->>'error', 'unknown');
        if v_err like 'no price%' or v_err like 'price unavailable%' then
          v_skipped := v_skipped + 1;                       -- 시세 문제는 주문 탓이 아니다 → 그대로 둔다
        else
          update public.crypto_pending cp set status = 'rejected', reason = v_err, updated_at = now() where cp.id = r.id;   -- ③
          v_rejected := v_rejected + 1;
        end if;
      end if;
    exception when others then
      v_failed := v_failed + 1;                             -- 한 주문의 예외가 나머지를 막지 않는다. 그 주문은 pending 으로 남는다.
    end;
  end loop;
  return jsonb_build_object('ok',true,'seen',v_seen,'filled',v_filled,'rejected',v_rejected,'skipped',v_skipped,'failed',v_failed);
end;$$;
revoke all on function public.crypto_pending_fill() from public, anon, authenticated;
grant execute on function public.crypto_pending_fill() to service_role;

-- 7) 크론 — 매분
select cron.unschedule('crypto_pending_fill') where exists (select 1 from cron.job where jobname = 'crypto_pending_fill');
select cron.schedule('crypto_pending_fill', '* * * * *', $$ select public.crypto_pending_fill(); $$);

-- 8) 확인 (읽기 전용):
--   select jobname, schedule, active from cron.job where jobname = 'crypto_pending_fill';
--   select public.crypto_pending_fill();                       -- {"ok":true,"seen":0,...}
--   select id, asset, side, otype, usd, qty, trigger, status, reason, fill_price from public.crypto_pending order by created_at desc limit 20;
--   -- 시장가가 그대로인지: 앱에서 소액 매수 1건 → crypto_trades 에 행 1개 · crypto_holdings 변동 확인.
--
-- 되돌리기 (대기주문 기능만 끄기 — 시장가는 그대로 동작):
--   select cron.unschedule('crypto_pending_fill');
--   revoke execute on function public.crypto_place_pending(text,text,text,text,text,numeric,numeric,numeric) from authenticated;
--   (대기 중이던 주문은 체결되지 않고 남는다. update public.crypto_pending set status='cancelled' where status='pending'; 로 정리)
--   시장가까지 옛 함수로 되돌리려면 crypto_trade.sql 을 다시 실행한다.
