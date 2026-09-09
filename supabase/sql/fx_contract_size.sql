-- Alpexa — 계약 크기(contract size) 단일 출처 · 2026-09-09 사장님 승인 (DOGE·XRP·ADA 1랏 = 10,000)
-- ============================================================================
-- ⚠️ 생성 파일 — 직접 수정 금지. 원본: fx_open_margin.sql · fx_close.sql · fx_stopout.sql
--    → node tools/build-contract-size-sql.js  (tests/fx-contract-size.test.js S4 가 소스 일치를 강제)
--
-- 왜: 계약 크기가 서버 3함수 + 클라 2파일에 CASE 문으로 5벌 복제돼 있었다. 진실을 fx_specs.contract
-- 한 곳으로 옮긴다. 서버는 fx_contract() 로만 읽고, 클라는 락스텝 표(테스트 강제)로 미러한다.
--
-- 배포 순서 (영구 수동 · 돈 코드):
--   [1단계] 이 파일의 1단계 블록 전체 — 컬럼 추가 + 현재값 백필 + 헬퍼 + 3함수 교체. **동작 변화 0.**
--           (DOGE 등 크립토 contract=1 그대로 → 마진·손익·플로팅 전부 지금과 동일)
--   [2단계] 클라 2단계 커밋 배포 **전에** 2단계 블록 실행 — DOGE·XRP·ADA contract 10,000 +
--           열린 포지션/펜딩 size ÷ 10,000 (코인 수 → 랏) 을 한 트랜잭션으로. 명목가·마진·손익 불변.
--           옛 클라가 그 사이 코인 수로 주문하면 서버가 랏×10,000 으로 마진을 요구해 거절(fail-closed).
-- ============================================================================

-- ════════ 1단계 — 컬럼 + 백필 + 헬퍼 + 3함수 (동작 변화 0) ════════
alter table public.fx_specs add column if not exists contract numeric not null default 1;
update public.fx_specs
   set contract = case symbol when 'XAUUSD' then 100 when 'XAGUSD' then 5000
                  else case cls when 'FX' then 100000 else 1 end end
 where contract = 1;   -- 이미 값이 있는 행은 건드리지 않는다 (재실행 안전)

-- 계약 크기 헬퍼: 스펙 행 우선, 없으면 옛 CASE 폴백 (새 숫자 발명 금지 — 옛 코드와 동일 값)
create or replace function public.fx_contract(p_symbol text, p_cls text default null)
returns numeric language sql stable as $$
  select coalesce((select contract from public.fx_specs where symbol = p_symbol),
                  case when p_symbol = 'XAUUSD' then 100 when p_symbol = 'XAGUSD' then 5000
                       when p_cls = 'FX' then 100000 else 1 end)::numeric;
$$;

-- ── fx_notional_usd (원본 fx_open_margin.sql) ──
create or replace function public.fx_notional_usd(p_symbol text, p_cls text, p_size numeric, p_price numeric)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_lot numeric; v_base text; v_quote text; v_conv numeric;
begin
  v_lot := public.fx_contract(p_symbol, p_cls);   -- 계약 크기 진실 = fx_specs.contract (fx_contract_size.sql, 2026-09-09)
  if p_cls <> 'FX' then return p_size * v_lot * p_price; end if;
  v_base := substr(p_symbol,1,3); v_quote := substr(p_symbol,4,3);
  if v_quote = 'USD' then return p_size * v_lot * p_price; end if;
  if v_base = 'USD' then return p_size * v_lot; end if;
  v_conv := public.fx_ccy_to_usd(v_base);            -- cross pair
  if v_conv is null then return null; end if;        -- no reference → caller rejects
  return p_size * v_lot * v_conv;
end;$$;

-- ── fx_close (원본 fx_close.sql) ──
create or replace function public.fx_close(p_local_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_pos public.positions%rowtype;
  v_cust text; v_acct text; v_cls text;
  v_mid numeric; v_pts timestamptz;
  v_side text; v_open numeric; v_size numeric; v_sym text;
  v_lot numeric; v_dist numeric; v_pnlq numeric; v_pnl numeric;
  v_base text; v_quote text; v_q2usd numeric; v_qmid numeric;
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0; v_close numeric;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not authenticated'); end if;

  -- find THIS caller's open FX position — WITH A ROW LOCK (FOR UPDATE OF p).
  -- Race hardening: the 30% stop-out cron and a user hammering the red ✕ can hit the SAME
  -- position at the same instant. FOR UPDATE serialises them — the 2nd caller BLOCKS until the
  -- 1st commits, then Postgres re-checks the WHERE against the new row version: status is now
  -- 'closed', so it no longer matches status='open' → this SELECT returns nothing → we reject as
  -- 'already closed'. So P&L is computed and banked EXACTLY once (no double-close, no double-bank).
  -- (The atomic UPDATE ... WHERE status='open' below stays as a second, independent backstop.)
  select p.* into v_pos
    from public.positions p
    join public.accounts a on a.acct_no = p.acct_no
    join public.players  pl on pl.id = a.player_id
   where p.local_id = p_local_id and p.server = 'fx' and p.status = 'open'
     and pl.auth_id = auth.uid()
   limit 1
   for update of p;
  if v_pos.local_id is null then return jsonb_build_object('ok',false,'error','position not found or already closed','code','ALREADY_CLOSED'); end if;
  v_acct := v_pos.acct_no; v_sym := v_pos.symbol; v_side := v_pos.side;
  v_open := coalesce(v_pos.open_price,0); v_size := coalesce(v_pos.size,0);
  v_cust := v_pos.cust_id;   -- positions carries cust_id (accounts does not)

  -- class spec (reject if unknown -> client fallback)
  select cls into v_cls from public.fx_specs where symbol = v_sym;
  if v_cls is null then return jsonb_build_object('ok',false,'error','no spec for '||v_sym); end if;

  -- ── 세션 게이트 (2026-08-15 사장님 "마켓이 클로즈 됐는데 포지션을 닫을 수 있게 되있지..막아야") ──
  -- 열기(fx_open)는 2026-07-22부터 서버에서 막혔는데 **닫기는 뚫려 있었다.** 장이 닫히면 가격이
  -- 종가에 얼어붙는데, 그 정지가로 청산하면 다음 개장 갭을 보고 유리한 쪽만 확정할 수 있다
  -- (하우스 대상 차익거래). 실제 규제 브로커·MT5 모두 마감 중 청산을 거절한다.
  --   · 판정은 fx_open 과 **같은 함수** `fx_market_open(cls, at)` 재사용 → 열기/닫기 자동 락스텝.
  --     새 캘린더를 만들면 둘이 어긋난다(그게 이 코드베이스의 반복된 사고 패턴).
  --   · 이 게이트는 **고객이 직접 부르는 이 RPC 에만** 걸린다. 서버 리스크 엔진(fx_modify 의 SL/TP
  --     집행, fx_stopout)은 이 RPC 를 호출하지 않고 자체적으로 settlements 를 기록하므로 영향 없다
  --     — 마감 중에도 리스크 관리는 계속 돌아야 한다.
  if not public.fx_market_open(v_cls, now()) then
    return jsonb_build_object('ok',false,'error','Market closed','code','MARKET_CLOSED');
  end if;

  -- SERVER close price + freshness (reject if missing/stale -> client fallback)
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = v_sym limit 1;
  if v_mid is null or v_mid <= 0 then return jsonb_build_object('ok',false,'error','no price for '||v_sym); end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then
    return jsonb_build_object('ok',false,'error','price unavailable (stale)');
  end if;

  -- SPREAD ON CLOSE (FX only): a BUY position is closed by SELLING at BID (mid-half),
  -- a SELL position is closed by BUYING at ASK (mid+half). Mirrors fx_open's fill side
  -- so a round-trip pays the full spread once. Non-FX (crypto/stock/index) uses a
  -- bps-of-price spread instead (see else branch) — every instrument carries a spread.
  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = v_sym limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = v_sym limit 1;
    -- pip MUST mirror fx-prices Edge pip() that produced spr_pts (see fx_open_margin.sql):
    -- JPY=0.01, XAUUSD=0.01, XAGUSD=0.001, else 0.0001. Keep in lockstep with fx_open.
    v_pip := case when v_sym like '%JPY' then 0.01
                  when v_sym = 'XAUUSD' then 0.01
                  when v_sym = 'XAGUSD' then 0.001
                  else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
  else
    -- NON-FX (crypto/stock/index): HYBRID — the greater of the house FLOOR (bps) and the
    -- REAL exchange spread (spr_pts, carried in BPS for these classes by crypto-prices
    -- bookTicker; 0 when no book → floor applies). Calm markets show the floor; volatile/
    -- illiquid pairs widen automatically. FULL round-trip bps; one-way = bps/2. MUST match
    -- trading.html ALPEXA_SPREAD_BPS + fxHalfSpread (lockstep) or floating ≠ realized.
    -- MT5 convention: every instrument carries a dealing spread — the house earns it.
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = v_sym limit 1;
    v_half := v_mid * greatest(
        (case v_cls when 'CRYPTO' then 10 when 'STOCK' then 8 when 'INDEX' then 6 else 0 end),
        coalesce(v_spr,0)
      ) / 10000.0 / 2.0;
  end if;
  v_close := v_mid + (case when upper(v_side) = 'BUY' then -v_half else v_half end);

  -- P&L (exact port of the client engine), USD
  v_lot  := public.fx_contract(v_sym, v_cls);   -- 계약 크기 진실 = fx_specs.contract (fx_contract_size.sql, 2026-09-09)
  v_dist := (v_close - v_open) * (case when upper(v_side) = 'BUY' then 1 else -1 end);
  v_pnlq := v_dist * v_lot * v_size;
  if v_cls <> 'FX' then
    v_pnl := v_pnlq;
  else
    v_base := left(v_sym,3); v_quote := substr(v_sym,4,3);
    if v_quote = 'USD' then
      v_pnl := v_pnlq;
    elsif v_base = 'USD' then
      v_pnl := v_pnlq / v_mid;
    else
      -- cross pair: quote -> USD live from prices ('USD'+quote -> 1/mid, else quote+'USD' -> mid)
      select mid into v_qmid from public.prices where symbol = 'USD'||v_quote limit 1;
      if v_qmid is not null and v_qmid > 0 then v_q2usd := 1.0 / v_qmid;
      else
        select mid into v_qmid from public.prices where symbol = v_quote||'USD' limit 1;
        if v_qmid is not null and v_qmid > 0 then v_q2usd := v_qmid; end if;
      end if;
      if v_q2usd is null then return jsonb_build_object('ok',false,'error','no fx rate for '||v_quote); end if;
      v_pnl := v_pnlq * v_q2usd;
    end if;
  end if;
  v_pnl := round(v_pnl, 2);

  -- SWAP (2026-07-19 fx_swap.sql): 야간 크론이 meta.swap에 적립한 스왑을 청산 실현에 포함 —
  -- "표시되는 스왑 == 정산되는 스왑" 불변식. 적립이 없으면 0 (기존 동작 그대로).
  v_pnl := round(v_pnl + coalesce((select (meta->>'swap')::numeric from public.positions
             where local_id = p_local_id and acct_no = v_acct and server = 'fx' limit 1), 0), 2);

  -- ATOMIC CLAIM: close only if still open (prevents double-bank across devices)
  update public.positions set status = 'closed', pnl = v_pnl
    where local_id = p_local_id and acct_no = v_acct and server = 'fx' and status = 'open';
  if not found then return jsonb_build_object('ok',true,'duplicate',true); end if;

  -- Record the settlement. settlements has trg_settlement_balance (AFTER INSERT)
  -- which applies pnl to accounts.balance — so this ONE insert both banks the P&L
  -- and writes the closed-trade history the app reads. (Do NOT also write `ledger`:
  -- it has its own balance trigger and would double-count.)
  insert into public.settlements(cust_id, acct_no, server, kind, local_id, symbol, stake, pnl, detail)
    values (v_cust, v_acct, 'fx', 'fx_close', p_local_id, v_sym, v_size, v_pnl,
            upper(v_side)||' '||v_size||' @ '||v_open||' -> '||round(v_close,5));

  return jsonb_build_object('ok',true,'pnl',v_pnl,'close',round(v_close,6),'side',upper(v_side),'size',v_size);
end;$$;

-- ── fx_realized_pnl (원본 fx_stopout.sql) ──
create or replace function public.fx_realized_pnl(
  p_symbol text, p_side text, p_open numeric, p_size numeric,
  p_close_override numeric default null
) returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_cls text; v_mid numeric; v_pts timestamptz;
  v_spr numeric; v_mk numeric; v_pip numeric; v_half numeric := 0; v_close numeric;
  v_lot numeric; v_dist numeric; v_pnlq numeric; v_pnl numeric;
  v_base text; v_quote text; v_qmid numeric; v_q2usd numeric;
begin
  select cls into v_cls from public.fx_specs where symbol = p_symbol;
  if v_cls is null then return null; end if;
  select mid, updated_at into v_mid, v_pts from public.prices where symbol = p_symbol limit 1;
  if v_mid is null or v_mid <= 0 then return null; end if;
  if v_pts is null or (now() - v_pts) > interval '120 seconds' then return null; end if;

  if v_cls = 'FX' then
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    select coalesce(markup_pts,0) into v_mk from public.pricing_marks where symbol = p_symbol limit 1;
    v_pip := case when p_symbol like '%JPY' then 0.01
                  when p_symbol = 'XAUUSD' then 0.01
                  when p_symbol = 'XAGUSD' then 0.001
                  else 0.0001 end;
    v_half := greatest(0.1, coalesce(v_spr,0) + coalesce(v_mk,0)) * v_pip / 2.0;
  else
    select coalesce(spr_pts,0) into v_spr from public.prices where symbol = p_symbol limit 1;
    v_half := v_mid * greatest(
        (case v_cls when 'CRYPTO' then 10 when 'STOCK' then 8 when 'INDEX' then 6 else 0 end),
        coalesce(v_spr,0)
      ) / 10000.0 / 2.0;
  end if;
  v_close := v_mid + (case when upper(p_side) = 'BUY' then -v_half else v_half end);
  -- 워터마크 레벨가 정산: 오버라이드가 오면 그 가격이 청산가 (레벨=고객 지정가, 스프레드 기반영 간주)
  if p_close_override is not null and p_close_override > 0 then v_close := p_close_override; end if;

  v_lot  := public.fx_contract(p_symbol, v_cls);   -- 계약 크기 진실 = fx_specs.contract (fx_contract_size.sql, 2026-09-09)
  v_dist := (v_close - p_open) * (case when upper(p_side) = 'BUY' then 1 else -1 end);
  v_pnlq := v_dist * v_lot * p_size;
  if v_cls <> 'FX' then
    v_pnl := v_pnlq;
  else
    v_base := left(p_symbol,3); v_quote := substr(p_symbol,4,3);
    if v_quote = 'USD' then
      v_pnl := v_pnlq;
    elsif v_base = 'USD' then
      v_pnl := v_pnlq / v_mid;
    else
      select mid into v_qmid from public.prices where symbol = 'USD'||v_quote limit 1;
      if v_qmid is not null and v_qmid > 0 then v_q2usd := 1.0 / v_qmid;
      else
        select mid into v_qmid from public.prices where symbol = v_quote||'USD' limit 1;
        if v_qmid is not null and v_qmid > 0 then v_q2usd := v_qmid; end if;
      end if;
      if v_q2usd is null then return null; end if;
      v_pnl := v_pnlq * v_q2usd;
    end if;
  end if;
  return round(v_pnl, 2);
end;$$;

-- 확인 (읽기 전용):
--   select symbol, cls, contract from public.fx_specs order by cls, symbol;
--   select public.fx_contract('DOGEUSD','CRYPTO'), public.fx_contract('EURUSD','FX'), public.fx_contract('XAUUSD','FX');


-- ════════ 2단계 — DOGE·XRP·ADA 1랏 = 10,000 (클라 2단계 배포 직전에 실행) ════════
-- 2단계 배포 전에는 이 블록을 실행하지 않는다. 실행 전 열린 포지션 확인:
--   select symbol, count(*), sum(size) from public.positions
--    where server='fx' and status='open' and symbol in ('DOGEUSD','XRPUSD','ADAUSD') group by symbol;
--
-- begin;
--   update public.fx_specs set contract = 10000 where symbol in ('DOGEUSD','XRPUSD','ADAUSD');
--   -- 열린 포지션: 코인 수 → 랏 (명목가·마진·손익 불변 — 계약×size 가 같은 값)
--   update public.positions set size = round(size / 10000, 6)
--    where server = 'fx' and status = 'open' and symbol in ('DOGEUSD','XRPUSD','ADAUSD');
--   -- 펜딩 주문도 같은 단위로
--   update public.fx_pending set size = round(size / 10000, 6)
--    where status = 'pending' and symbol in ('DOGEUSD','XRPUSD','ADAUSD');
--   -- 지울 수 없는 기록 (백오피스 감사 로그)
--   select public._sbdesk_audit('contract_size_migration', 'DOGEUSD,XRPUSD,ADAUSD',
--            jsonb_build_object('contract', 10000, 'reason', 'MT5 alignment — 1 lot = 10,000 coins, pip value $1 (owner approval 2026-09-09)'));
-- commit;
