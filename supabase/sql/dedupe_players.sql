-- Alpexa — fix duplicate accounts per email (one player per auth user).
-- ============================================================================
-- Bug: signup inserted a NEW player + 3 accounts every time, with no check for an
-- existing profile — so re-signing up with the same email made duplicates (e.g. 8
-- accounts for one email). The signup code now reuses the existing player; this SQL
-- (1) cleans up the duplicates already created, and (2) adds a UNIQUE constraint so
-- duplicates are IMPOSSIBLE going forward (even if the client is bypassed).
--
-- ⚠️ This DELETES data. Run STEP 1 (preview) first and eyeball it. Keeper rule per
--    auth_id: the player with the highest total balance, ties broken by oldest.
-- ============================================================================

-- ── STEP 1 — PREVIEW: these duplicate players will be deleted (run alone first) ──
with ranked as (
  select p.id, p.auth_id, p.name, p.cust_id, p.email, p.created_at,
         coalesce((select sum(a.balance) from public.accounts a where a.player_id = p.id), 0) as total_bal,
         row_number() over (partition by p.auth_id
           order by coalesce((select sum(a.balance) from public.accounts a where a.player_id = p.id), 0) desc,
                    p.created_at asc) as rn
  from public.players p
  where p.auth_id is not null
)
select id, auth_id, name, cust_id, email, total_bal, rn as will_delete_if_gt_1
from ranked where rn > 1
order by auth_id, total_bal desc;

-- ── STEP 2 — DELETE the duplicates (accounts first for FK, then the player rows) ──
-- (Run after the preview looks right. Keeps exactly one player per auth_id.)
delete from public.accounts where player_id in (
  select id from (
    select p.id, row_number() over (partition by p.auth_id
      order by coalesce((select sum(a.balance) from public.accounts a where a.player_id = p.id), 0) desc,
               p.created_at asc) as rn
    from public.players p where p.auth_id is not null
  ) q where q.rn > 1
);
delete from public.players where id in (
  select id from (
    select p.id, row_number() over (partition by p.auth_id
      order by coalesce((select sum(a.balance) from public.accounts a where a.player_id = p.id), 0) desc,
               p.created_at asc) as rn
    from public.players p where p.auth_id is not null
  ) q where q.rn > 1
);

-- ── STEP 3 — make duplicates IMPOSSIBLE: one player per auth user ──
-- (Fails if STEP 2 didn't remove all duplicates — that's the point.)
alter table public.players add constraint players_auth_id_unique unique (auth_id);

-- Verify: should return 0 rows (no auth_id has >1 player).
-- select auth_id, count(*) from public.players where auth_id is not null
--   group by auth_id having count(*) > 1;
