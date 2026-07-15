-- Alpexa — Introducing-Broker(IB) 신청 저장소.
-- 공개 마케팅 폼(site/introducing-broker.html)에서 들어온 신청을 보관한다.
-- 폼은 인증이 없으므로 anon에게 INSERT 권한을 주지 않는다 — Edge 함수 `broker-apply`가
-- service_role로 저장한다(서버 권위). 이 테이블은 RLS 잠금 + service_role/admin만 읽음.
-- 배포: SQL 에디터(사용자).

create table if not exists public.broker_applications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  full_name   text not null,
  email       text not null,
  notes       text,
  source      text default 'introducing-broker',
  user_agent  text,
  status      text not null default 'new'   -- new | reviewing | approved | rejected
);

create index if not exists broker_applications_created_idx
  on public.broker_applications (created_at desc);

-- RLS: 켜되 anon/authenticated 정책 없음 → 일반 키로는 읽기·쓰기 전부 불가.
-- service_role(Edge 함수)은 RLS를 우회하므로 저장 가능. admin 화면이 필요해지면
-- is_admin() select 정책을 따로 추가한다(지금은 service_role 전용).
alter table public.broker_applications enable row level security;

-- 혹시 기존에 느슨한 정책이 있으면 제거(멱등).
drop policy if exists broker_applications_anon_insert on public.broker_applications;
drop policy if exists broker_applications_public_read on public.broker_applications;

-- 확인: select * from public.broker_applications order by created_at desc;
