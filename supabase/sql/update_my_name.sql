-- Alpexa — update the signed-in customer's legal name on the server.
-- The Legal name editor used to write only localStorage (alpexa.userName), so the
-- change never reached the players table / back office / other devices. This RPC
-- updates the caller's own players row (matched by auth.uid()). SECURITY DEFINER so
-- it works regardless of the players RLS policy. Run ONCE in Supabase. Idempotent.

create or replace function public.update_my_name(p_name text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_n text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not authenticated'); end if;
  if length(v_n) < 1 or length(v_n) > 120 then return jsonb_build_object('ok', false, 'error', 'invalid name'); end if;
  update public.players set name = v_n where auth_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'no player'); end if;
  return jsonb_build_object('ok', true, 'name', v_n);
end;$$;
