-- Alpexa — 신규 가입 보너스 **폐지** (2026-08-16 사장님 "신규 가입자 보너스 없애줘")
-- ============================================================================
-- 이전(2026-07까지): 가입 시 Sports $100 현금 · FX $100 현금 · Crypto 100 ALPXS 1년 락 스테이크.
-- 지금: **전부 0.** 신규 계정은 세 서버 모두 잔고 0 으로 열리고, 자동 스테이크도 없다.
--
-- 기존 고객은 **회수하지 않는다** (사장님 결정). 이미 받은 잔고·스테이크는 그대로 두고,
-- accounts.bonus 값(=100)도 유지 → 그 $100 은 기존 계정에서 계속 **출금 불가**로 묶여 있다.
-- (withdraw_guard.sql 의 withdrawable_for = balance − bonus 규칙이 그대로 살아 있다.)
--
-- 범위 밖 = 추천코드(redeem_referral.sql). 코드를 직접 입력해야 받는 별개 프로그램이라 유지.
--
-- ⚠️ force_opening_balance 는 **withdraw_guard.sql 에도 정의돼 있다**(bonus 컬럼까지 세팅하는
--    최신판). 두 파일 중 나중에 실행한 쪽이 이긴다 → **둘 다 0** 이어야 하고, 둘 다 그렇게
--    맞춰 뒀다. tests/no-signup-bonus.test.js 가 두 파일을 같이 검사한다.
--
-- 배포: 이 파일 전체 1회 실행. 재실행 안전(idempotent).
-- ============================================================================

-- ① 신규 가입 계정의 오프닝 잔고 = 0 (관리자 생성은 예외 — 백오피스가 임의 금액 설정 가능).
create or replace function public.force_opening_balance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then
    new.balance := 0;
    new.bonus   := 0;   -- 비출금 웰컴머니도 없음 → 출금가능 = 실제 입금액 전부
  end if;
  return new;
end;$$;

drop trigger if exists trg_force_opening_balance on public.accounts;
create trigger trg_force_opening_balance
  before insert on public.accounts
  for each row execute function public.force_opening_balance();

-- ② 크립토 웰컴 스테이크(100 ALPXS 1년 락) 자동 생성 **중단**.
--    함수만 지우면 이미 배포된 트리거가 남아 계속 도니, 트리거를 명시적으로 내린다.
--    기존 고객이 이미 받은 crypto_stakes 행은 건드리지 않는다 (회수 없음).
drop trigger if exists trg_seed_crypto_welcome on public.accounts;
drop function if exists public.seed_crypto_welcome_stake();

-- ③ 확인(읽기 전용):
--   select tgname from pg_trigger where tgrelid='public.accounts'::regclass and not tgisinternal;
--     → trg_force_opening_balance 만 남고 trg_seed_crypto_welcome 은 없어야 한다.
--   select prosrc from pg_proc where proname='force_opening_balance';
--     → new.balance := 0; new.bonus := 0; 만 보여야 한다 (100 이 남아 있으면 다른 파일이 덮은 것).
