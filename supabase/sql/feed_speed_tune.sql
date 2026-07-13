-- Alpexa — 피드 갱신 속도 진단 + 튜닝 (2026-07-13, "데이터가 느리다" 이슈)
-- 실측(웹트레이드 하네스, 30초 샘플): FX ≈5초 · 크립토 ≈5초 · 주식 ≈60초.
-- 클라이언트는 1초 폴링 + 300ms 렌더라 병목이 아님 — 체감 속도는 아래 pg_cron 주기가 전부다.
-- ⚠️ 사용자가 Supabase SQL Editor에서 실행 (Claude은 배포 불가). 섹션별로 나눠 실행할 것.

-- ── 1) 진단: 지금 실제로 걸려 있는 스케줄과 최근 실행 결과를 눈으로 확인 ──
select jobid, jobname, schedule, active from cron.job order by jobname;
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
 where d.start_time > now() - interval '10 minutes'
 order by d.start_time desc limit 40;
-- 읽는 법: fx-prices가 '3 seconds'로 걸려 있는데 실측 5초면 그 2초는 pg_net/Edge/Polygon 왕복 지연.
-- status가 failed로 반복되면 주기보다 그 에러(rate limit 등)가 먼저다 — 아래 튜닝 전에 해결.

-- ── 2) 크립토를 5초 → 3초 (안전: crypto-price는 Binance 공개 미러라 한도 여유) ──
select cron.unschedule('crypto-prices-60s');
select cron.schedule('crypto-prices-3s', '3 seconds', $$
  select net.http_get(
    url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/crypto-price'
  );
$$);

-- ── 3) FX를 2초로 (조건부: Polygon 유료 플랜일 때만) ──
-- fx-prices는 호출 1번에 전 티커를 받아온다(30/min). Polygon 무료 티어는 5 calls/min이라
-- 무료 키면 2초(30/min)는 물론 3초(20/min)도 한도 초과 → 1)의 job_run_details에서 실패가
-- 없는지 확인한 뒤에만 실행. 실패가 보이면 이 섹션은 건너뛴다.
-- select cron.unschedule('fx-prices-10s');
-- select cron.schedule('fx-prices-2s', '2 seconds', $$
--   select net.http_get(url := 'https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/fx-prices?token=<CRON_SECRET>');
-- $$);

-- ── 4) 주식 1분은 Finnhub 무료 한도의 천장 ──
-- stock-prices는 심볼당 1콜 × 35심볼 ≈ 35 calls/run, Finnhub 무료 60 calls/min → 1분 미만 불가.
-- 더 빠르게 하려면 (a) Finnhub 유료 키, 또는 (b) stock-prices Edge를 "절반씩 교대 30초" 방식으로
-- 패치(코드 변경, 검토 후 별도 제공). 크론만 당기면 rate-limit로 오히려 피드가 죽는다 — 금지.

-- 되돌리기: select cron.unschedule('crypto-prices-3s');  후 crypto_prices_cron.sql 재실행.
-- 검증: 1)의 진단 쿼리 재실행 + prices.updated_at 간격 확인.
