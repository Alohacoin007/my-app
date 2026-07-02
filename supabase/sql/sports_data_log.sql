-- ══════════════════════════════════════════════════════════════════════════
--  Sports Data-Integrity Log + daily analyzer  (feeds sports-analyzer.html)
--  live_games only holds the CURRENT snapshot (id='all', overwritten ~1min by
--  the sports-games Edge fn). This adds a timestamped HISTORY so any day can be
--  reconstructed and feed problems (synthetic games, stalls, stuck-live) caught.
--
--  DEPLOY (you run this — Claude cannot):
--    1. Run this whole file in the Supabase SQL editor.
--    2. Schedule the capture on pg_cron (every 1 min), same cadence as the feed:
--         select cron.schedule('game-snapshot','* * * * *',
--                 $$ select public.log_game_snapshot(); $$);
--    3. Open sports-analyzer.html as an admin → data appears from now on.
--  NOTE: history is NOT retroactive — it starts accumulating the moment the cron
--        runs (past data was already overwritten in live_games).
--  Phase-2 (next file): result-correctness — join settlements + a 2nd score
--        source to verify the outcome we settled on was actually right.
-- ══════════════════════════════════════════════════════════════════════════

-- 1) current state per game (to diff against, so we log only CHANGES) ---------
create table if not exists public.game_state (
  gid       text primary key,
  lg        text,
  home      text,
  away      text,
  status    text,           -- 'in' (live) | 'sched'  (live_games carries only a live flag)
  home_sc   int,
  away_sc   int,
  odds      jsonb,
  updated_at timestamptz not null default now()
);
alter table public.game_state enable row level security;   -- writes via SECURITY DEFINER only; no public policy

-- 2) append-only change log (the history) ------------------------------------
create table if not exists public.game_log (
  id        bigserial primary key,
  gid       text not null,
  lg        text,
  home      text,
  away      text,
  status    text,
  home_sc   int,
  away_sc   int,
  odds      jsonb,
  synthetic boolean not null default false,   -- gid not matching the real ESPN pattern LG_<eventId>
  seen_at   timestamptz not null default now(),
  day       date generated always as (((seen_at at time zone 'America/Los_Angeles'))::date) stored
);
create index if not exists game_log_day_idx  on public.game_log(day);
create index if not exists game_log_gid_idx  on public.game_log(gid, seen_at);
alter table public.game_log enable row level security;
drop policy if exists game_log_admin_read on public.game_log;
create policy game_log_admin_read on public.game_log for select using (public.is_admin());

-- 3) snapshot: read live_games, append only what CHANGED vs game_state --------
create or replace function public.log_game_snapshot() returns int
language plpgsql security definer set search_path=public as $$
declare
  arr jsonb; g jsonb;
  _gid text; _lg text; _home text; _away text; _st text;
  _hs int; _as int; _od jsonb; _synth boolean;
  prev public.game_state%rowtype; n int := 0;
begin
  select data into arr from public.live_games where id = 'all';
  if arr is null then return 0; end if;

  for g in select value from jsonb_array_elements(arr) loop
    _gid := g->>'gid';
    if _gid is null then continue; end if;
    _lg   := coalesce(g->>'lg', split_part(_gid,'_',1));
    _home := coalesce(g#>>'{home,ab}', g#>>'{home,nm}');
    _away := coalesce(g#>>'{away,ab}', g#>>'{away,nm}');
    _st   := case when (g->>'live') = 'true' then 'in' else 'sched' end;
    _hs   := nullif(g#>>'{home,sc}','')::int;
    _as   := nullif(g#>>'{away,sc}','')::int;
    _od   := jsonb_strip_nulls(jsonb_build_object('ml',g->'ml','spread',g->'spread','total',g->'total'));
    _synth := (_gid !~ '^[A-Z]+_[0-9]+$');   -- real ESPN gid = LG_<numericEventId>

    select * into prev from public.game_state where gid = _gid;
    if prev.gid is null
       or prev.status  is distinct from _st
       or prev.home_sc is distinct from _hs
       or prev.away_sc is distinct from _as
       or prev.odds    is distinct from _od then
      insert into public.game_log(gid,lg,home,away,status,home_sc,away_sc,odds,synthetic)
        values (_gid,_lg,_home,_away,_st,_hs,_as,_od,_synth);
      insert into public.game_state(gid,lg,home,away,status,home_sc,away_sc,odds,updated_at)
        values (_gid,_lg,_home,_away,_st,_hs,_as,_od, now())
        on conflict (gid) do update
          set lg=_lg, home=_home, away=_away, status=_st,
              home_sc=_hs, away_sc=_as, odds=_od, updated_at=now();
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.log_game_snapshot() from public, anon, authenticated;
-- (called by pg_cron as the table owner / postgres — no client grant needed)

-- 4) daily analyzer report (admin-only) — powers sports-analyzer.html ---------
create or replace function public.get_game_day(p_day date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare _games jsonb; _anom jsonb; _sum jsonb; _feed jsonb;
        _tracked int; _updates int; _synth int; _unres int; _gaps int;
        _first timestamptz; _last timestamptz;
begin
  if not public.is_admin() then
    return jsonb_build_object('error','forbidden');
  end if;

  -- per-game rollup for the day
  with rows as (
    select gid,
           max(lg) lg, max(home) home, max(away) away,
           min(seen_at) first_seen, max(seen_at) last_seen, count(*) updates,
           bool_or(synthetic) synthetic,
           (array_agg(status  order by seen_at desc))[1] last_status,
           (array_agg(home_sc order by seen_at desc) filter (where home_sc is not null))[1] home_sc,
           (array_agg(away_sc order by seen_at desc) filter (where away_sc is not null))[1] away_sc
    from public.game_log
    where day = p_day
    group by gid
  ),
  g as (
    select r.*,
      -- "stuck live": went live but last change is stale (feed lost it mid-game) = unresolved
      (r.last_status = 'in' and r.last_seen < now() - interval '3 hours') as unresolved
    from rows r
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'gid',gid,'lg',lg,'home',home,'away',away,
             'first_seen',first_seen,'last_seen',last_seen,'updates',updates,
             'last_status',last_status,'home_sc',home_sc,'away_sc',away_sc,
             'synthetic',synthetic,
             -- result-correctness (resolved ✅) is phase-2 (settlement + 2nd source join)
             'resolved', false,
             'unresolved', unresolved
           ) order by first_seen), '[]'::jsonb)
  into _games from g;

  -- summary
  select count(*),
         coalesce(sum(updates),0),
         count(*) filter (where synthetic),
         count(*) filter (where unresolved)
  into _tracked,_updates,_synth,_unres from g;

  -- feed activity window + gaps (>5 min between consecutive log rows in the day)
  select min(seen_at), max(seen_at) into _first,_last from public.game_log where day = p_day;
  with t as (
    select seen_at, lag(seen_at) over (order by seen_at) prev
    from public.game_log where day = p_day
  )
  select count(*) into _gaps from t
   where prev is not null and seen_at - prev > interval '5 minutes';

  _sum := jsonb_build_object(
    'tracked',coalesce(_tracked,0),'updates',coalesce(_updates,0),
    'gaps',coalesce(_gaps,0),'synthetic',coalesce(_synth,0),
    'unresolved',coalesce(_unres,0),
    'resolved',0);   -- phase-2

  -- anomalies list
  _anom := '[]'::jsonb;
  select coalesce(jsonb_agg(a),'[]'::jsonb) into _anom from (
    select jsonb_build_object('sev','red','type','Synthetic game ',
             'detail','bettable card not from the ESPN feed — cannot auto-settle','gid',gid) a
      from g where synthetic
    union all
    select jsonb_build_object('sev','red','type','Unresolved ',
             'detail','went live then the feed went stale — never reached a final','gid',gid)
      from g where unresolved
    union all
    select jsonb_build_object('sev','yellow','type','Feed gaps ',
             'detail',_gaps || ' break(s) >5 min in the update stream','gid','')
      where _gaps > 0
  ) s;

  _feed := jsonb_build_object('first',_first,'last',_last);

  return jsonb_build_object('day',p_day,'summary',_sum,'games',_games,
                            'anomalies',_anom,'feed',_feed);
end $$;
grant execute on function public.get_game_day(date) to authenticated;   -- body still gates on is_admin()
