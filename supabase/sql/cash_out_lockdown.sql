-- cash_out 잠금 (2026-07-27 전수감사 — 사장님 승인)
--
-- 발견: cash_out은 "지급 먼저 → 상태 변경 나중" 순서 + ref에 타임스탬프(멱등 아님) —
-- 같은 베팅에 동시 호출 N번이면 N번 지급되는 경쟁 구멍. 캐시아웃은 UI에서 꺼져 있지만
-- (CASHOUT_ENABLED=false) RPC는 살아있어 직접 호출로 뚫린다.
--
-- 조치: 기능을 쓰지 않는 동안 고객 실행 권한 자체를 회수 (호출 = permission denied).
-- 재개할 때는 선점(claim-first) + 멱등 ref 구조로 재설계 후 grant 복원 —
-- 그 전까지 이 잠금이 유일한 안전 상태다.
--
-- 배포: SQL 에디터에서 실행. 확인: 고객 세션에서 cash_out 호출 → permission denied.
revoke execute on function public.cash_out(text, numeric) from public, anon, authenticated;
grant execute on function public.cash_out(text, numeric) to service_role;
