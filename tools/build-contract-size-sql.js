// Alpexa — fx_contract_size.sql 생성기. 서버 3함수 본문을 소스 파일에서 그대로 추출해 배포 파일을 만든다.
// 왜: 배포 파일에 함수를 손으로 복사하면 소스와 갈라진다. tests/fx-contract-size.test.js S4 가 바이트 일치를 강제.
// 사용: node tools/build-contract-size-sql.js  → supabase/sql/fx_contract_size.sql
'use strict';
const fs = require('fs'), path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const fnBlock = (src, name) => { const m = src.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`)); if (!m) throw new Error('missing ' + name); return m[0]; };
const notional = fnBlock(R('supabase/sql/fx_open_margin.sql'), 'fx_notional_usd');
const close = fnBlock(R('supabase/sql/fx_close.sql'), 'fx_close');
const realized = fnBlock(R('supabase/sql/fx_stopout.sql'), 'fx_realized_pnl');
const out = `-- Alpexa — 계약 크기(contract size) 단일 출처 · 2026-09-09 사장님 승인 (DOGE·XRP·ADA 1랏 = 10,000)
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
${notional}

-- ── fx_close (원본 fx_close.sql) ──
${close}

-- ── fx_realized_pnl (원본 fx_stopout.sql) ──
${realized}

-- 확인 (읽기 전용):
--   select symbol, cls, contract from public.fx_specs order by cls, symbol;
--   select public.fx_contract('DOGEUSD','CRYPTO'), public.fx_contract('EURUSD','FX'), public.fx_contract('XAUUSD','FX');


-- ════════ 2단계 — DOGE·XRP·ADA 1랏 = 10,000 (클라 2단계 배포 직전에 실행) ════════
-- 1단계 실행 + 클라 2단계 커밋 **직전**에 실행 (2026-09-10 사장님 진행 지시). 재실행 금지 — 두 번 돌면
-- size 가 또 ÷10,000 된다. 실행 전 열린 포지션 확인:
--   select symbol, count(*), sum(size) from public.positions
--    where server='fx' and status='open' and symbol in ('DOGEUSD','XRPUSD','ADAUSD') group by symbol;
begin;
  -- 멱등 가드: 이미 10000 이면 아무것도 하지 않는다 (두 번 실행해도 size 가 두 번 나뉘지 않게)
  do $mig$
  begin
    if exists (select 1 from public.fx_specs where symbol = 'DOGEUSD' and contract = 10000) then
      raise exception 'contract_size_migration already applied — skip';
    end if;
  end $mig$;
  update public.fx_specs set contract = 10000 where symbol in ('DOGEUSD','XRPUSD','ADAUSD');
  -- 열린 포지션: 코인 수 → 랏 (명목가·마진·손익 불변 — 계약×size 가 같은 값)
  update public.positions set size = round(size / 10000, 6)
   where server = 'fx' and status = 'open' and symbol in ('DOGEUSD','XRPUSD','ADAUSD');
  -- 펜딩 주문도 같은 단위로
  update public.fx_pending set size = round(size / 10000, 6)
   where status = 'pending' and symbol in ('DOGEUSD','XRPUSD','ADAUSD');
  -- 지울 수 없는 기록 (백오피스 감사 로그)
  select public._sbdesk_audit('contract_size_migration', 'DOGEUSD,XRPUSD,ADAUSD',
           jsonb_build_object('contract', 10000, 'reason', 'MT5 alignment — 1 lot = 10,000 coins, pip value $1 (owner approval 2026-09-09)'));
commit;
`;
fs.writeFileSync(path.join(__dirname, '..', 'supabase/sql/fx_contract_size.sql'), out);
console.log('🟢 supabase/sql/fx_contract_size.sql 생성 (' + out.length + ' bytes)');
