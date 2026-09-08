-- Alpexa — FX 포지션 정정 (백오피스 · MT5 Manager "Position Modify" 상당)
-- ============================================================================
-- 2026-09-08 사장님 요청. 관리자가 **열린 FX 포지션**의 방향(side)·진입가(open_price)·
-- 수량(size)을 정정한다. 실제 브로커의 매니저 터미널에 있는 기능이고, 계약은 하나다:
--
--   ★ 정정 사실은 지울 수 없게 남고 (admin_audit_log · 관리자만 열람 · 쓰기정책 없음)
--   ★ 돈은 한 푼도 직접 움직이지 않는다 (잔고·원장·pnl 컬럼 접근 0줄)
--
-- 정정 후 플로팅·마진·스왑·스탑아웃·PAMM NAV 는 전부 positions 의 side/open_price/size 를
-- 실시간으로 읽는 기존 엔진(fx_realized_pnl 등)이 새 값으로 다시 계산한다. 이 RPC 가 손익을
-- "만들지" 않는다 — 포지션 정의를 바꾸고 나머지는 시장이 정한다.
--
-- 기록은 **백오피스 한 곳**(admin_audit_log)에만 남긴다. 포지션 행(meta)에는 이력을 두지 않는다
-- — 계좌 주인이 API 로 읽는 행이라서. 고객 쪽에 보이는 것은 바뀐 값 자체와 그에 따른 손익뿐
-- (MT5 매니저가 포지션을 수정했을 때 고객 터미널이 보는 것과 같다).
--
-- 배포: 영구 수동 (돈 코드). Supabase SQL Editor 에 통째로 실행.
-- 검증:  select public.fx_admin_correct_position('<local_id>', 'SELL', null, null, '테스트');
--        select * from public.admin_audit_log where action = 'fx_position_correct' order by at desc limit 3;
-- 핀:    tests/fx-position-correct.test.js (verify 게이트)
-- ============================================================================

create or replace function public.fx_admin_correct_position(
  p_local_id   text,
  p_side       text    default null,   -- 'BUY' | 'SELL' | null(유지)
  p_open_price numeric default null,   -- null = 유지
  p_size       numeric default null,   -- null = 유지 (랏)
  p_reason     text    default ''      -- 필수. 빈 사유는 거절 — 무기록 개입 불가
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pos    public.positions%rowtype;
  v_side   text; v_price numeric; v_size numeric;
  v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  if length(trim(coalesce(p_reason,''))) < 3 then
    return jsonb_build_object('ok',false,'error','reason required (3+ chars)','code','REASON_REQUIRED'); end if;

  -- 대상: 열린 FX 포지션만. FOR UPDATE — 스탑아웃 크론 / 고객 청산 / SL·TP 집행과 같은 행을
  -- 동시에 만지지 못하게 직렬화한다 (fx_close 와 같은 이유).
  select * into v_pos from public.positions
   where local_id = p_local_id and server = 'fx' and status = 'open'
   limit 1 for update;
  if v_pos.local_id is null then
    return jsonb_build_object('ok',false,'error','position not found or not open','code','NOT_OPEN'); end if;

  v_side  := upper(coalesce(nullif(trim(p_side),''), v_pos.side));
  if v_side not in ('BUY','SELL') then
    return jsonb_build_object('ok',false,'error','side must be BUY or SELL','code','BAD_SIDE'); end if;
  v_price := coalesce(p_open_price, v_pos.open_price);
  if v_price is null or v_price <= 0 then
    return jsonb_build_object('ok',false,'error','open price must be > 0','code','BAD_PRICE'); end if;
  v_size  := coalesce(p_size, v_pos.size);
  if v_size is null or v_size <= 0 then
    return jsonb_build_object('ok',false,'error','size must be > 0','code','BAD_SIZE'); end if;

  v_before := jsonb_build_object('side', v_pos.side, 'open_price', v_pos.open_price, 'size', v_pos.size);
  v_after  := jsonb_build_object('side', v_side,     'open_price', v_price,          'size', v_size);

  -- 멱등: 같은 값으로 두 번 = 한 번. 변화가 없으면 행도 감사 로그도 건드리지 않는다.
  if v_before = v_after then
    return jsonb_build_object('ok',true,'changed',false,'local_id',p_local_id,'acct',v_pos.acct_no,'symbol',v_pos.symbol,'after',v_after);
  end if;

  update public.positions
     set side = v_side, open_price = v_price, size = v_size, updated_at = now()
   where local_id = p_local_id and server = 'fx' and status = 'open';

  -- 지울 수 없는 기록 — 기존 백오피스 감사 경로 재사용 (새 로그 테이블 만들지 않는다)
  perform public._sbdesk_audit('fx_position_correct', p_local_id,
    jsonb_build_object('acct', v_pos.acct_no, 'cust', v_pos.cust_id, 'symbol', v_pos.symbol,
                       'before', v_before, 'after', v_after, 'reason', trim(p_reason)));

  return jsonb_build_object('ok',true,'changed',true,'local_id',p_local_id,'acct',v_pos.acct_no,'symbol',v_pos.symbol,
                            'before',v_before,'after',v_after);
exception when others then
  return jsonb_build_object('ok',false,'error',SQLERRM);
end
$$;

-- ── 이력 조회 (데스크 ✎ · 관리자 전용) ──
create or replace function public.fx_admin_correction_log(p_local_id text default null, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok',false,'error','not admin'); end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.at desc), '[]'::jsonb) into v
    from (select at, admin_email, target as local_id, detail
            from public.admin_audit_log
           where action = 'fx_position_correct'
             and (p_local_id is null or target = p_local_id)
           order by at desc limit greatest(1, least(500, p_limit))) t;
  return jsonb_build_object('ok',true,'rows',v);
exception when others then return jsonb_build_object('ok',false,'error',SQLERRM); end
$$;

-- ── 게이트: authenticated 만 호출 가능 + 함수 안 is_admin 이 관문 (sbdesk 와 동일) ──
revoke all on function public.fx_admin_correct_position(text,text,numeric,numeric,text) from public, anon;
revoke all on function public.fx_admin_correction_log(text,int)                          from public, anon;
grant execute on function public.fx_admin_correct_position(text,text,numeric,numeric,text) to authenticated;
grant execute on function public.fx_admin_correction_log(text,int)                          to authenticated;
