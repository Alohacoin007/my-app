-- Alpexa — fire the welcome email on signup.
--
-- When the signup flow inserts the new customer's `players` row, this trigger calls the
-- send-welcome Edge Function (Resend) with the email + name. Server-side, so it fires for
-- every real signup regardless of the client. Async (pg_net) → never blocks the signup.
--
-- Before running:
--   1) Deploy the function:  supabase functions deploy send-welcome
--   2) Secrets: RESEND_API_KEY is set; the gate reuses your existing CRON_SECRET (already set).
--   3) Replace <CRON_SECRET> below with your CRON_SECRET value (same one used in cron_secure.sql).
--   4) alpexa-sports.com is verified in Resend (done) so info@ can send.
-- Then run this whole file in the Supabase SQL editor (idempotent).

create or replace function public.notify_welcome_email()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- only real self-signups (have an auth user + an email); skip admin/system rows.
  if NEW.email is null or length(trim(NEW.email)) = 0 or NEW.auth_id is null then
    return NEW;
  end if;
  perform net.http_post(
    url:='https://grxnbgtfnaayeluenvqh.supabase.co/functions/v1/send-welcome?token=<CRON_SECRET>',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu"}'::jsonb,
    body:=jsonb_build_object('email', NEW.email, 'name', coalesce(NEW.name, ''))
  );
  return NEW;
exception when others then
  -- a queue/HTTP hiccup must NEVER block account creation.
  return NEW;
end;$$;

drop trigger if exists trg_welcome_email on public.players;
create trigger trg_welcome_email
  after insert on public.players
  for each row execute function public.notify_welcome_email();
