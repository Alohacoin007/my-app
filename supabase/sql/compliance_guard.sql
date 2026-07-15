-- Alpexa — C2 (age 18+) + C3 (sanctioned-jurisdiction) enforcement, SERVER-SIDE.
-- ============================================================================
-- The signup page (compliance.js) gates these in the UI, but the client can be
-- bypassed. This trigger makes an underage / sanctioned signup IMPOSSIBLE at the
-- database — the players INSERT itself raises and rolls back. Admins are exempt
-- (manual back-office account creation).
--
-- Mirrors tests/compliance.test.js:  MIN_AGE = 18; sanctioned = OFAC comprehensive.
-- Country is matched on the stored NAME (signup.html COUNTRIES names), kept in sync
-- with compliance.js SANCTIONED_NAMES.
-- ============================================================================

create or replace function public.guard_player_compliance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_dob  date;
  v_age  int;
  v_sanctioned text[] := array['Cuba','Iran','North Korea','Syria','Russia','Belarus'];
begin
  -- Admins (is_admin) may create accounts manually; skip the gate for them.
  if public.is_admin() then return new; end if;

  -- ── C2: age 18+ ──────────────────────────────────────────────────────────
  -- dob is stored as text ('YYYY-MM-DD'). A missing/invalid dob is rejected
  -- (can't prove age → fail closed), same as the client gate.
  if new.dob is null or btrim(new.dob) = '' then
    raise exception 'Date of birth is required to open an account'
      using errcode = 'check_violation';
  end if;
  begin
    v_dob := new.dob::date;
  exception when others then
    raise exception 'Invalid date of birth' using errcode = 'check_violation';
  end;
  v_age := extract(year from age(current_date, v_dob))::int;
  if v_age < 18 then
    raise exception 'You must be at least 18 years old to open an account'
      using errcode = 'check_violation';
  end if;

  -- ── C3: sanctioned jurisdiction ──────────────────────────────────────────
  if new.country is not null and new.country = any(v_sanctioned) then
    raise exception 'Alpexa is not available in your country (%).', new.country
      using errcode = 'check_violation';
  end if;

  return new;
end;$$;

drop trigger if exists trg_guard_player_compliance on public.players;
create trigger trg_guard_player_compliance
  before insert on public.players
  for each row execute function public.guard_player_compliance();
