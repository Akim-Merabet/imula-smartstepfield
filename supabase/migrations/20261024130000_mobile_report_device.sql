-- App mobile terrain : remontée d'informations de l'appareil après chaque envoi réussi (spec 05 §1.8).
-- Profil « appareil » : alimente la fiche tablette (version, batterie, modèle, position, dernier envoi).
-- Tout profil : date de dernière activité de l'appareil lié (mobile_device_bindings).
create or replace function public.mobile_report_device(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_me uuid := private.current_collaborator_id(); v_device text := nullif(p ->> 'device_id', '');
begin
  if v_me is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.mobile_device_bindings set last_seen_at = now()
   where principal_id = v_me and (v_device is null or device_id = v_device);
  update public.tablets t set
    app_version = coalesce(nullif(p ->> 'app_version', ''), t.app_version),
    android_version = coalesce(nullif(p ->> 'os_version', ''), t.android_version),
    device_model = coalesce(nullif(p ->> 'model', ''), t.device_model),
    screen_size = coalesce(nullif(p ->> 'screen_size', ''), t.screen_size),
    unique_device_id = coalesce(v_device, t.unique_device_id),
    battery_level = case when (p ->> 'battery_level') ~ '^\d{1,3}$' then least(100, (p ->> 'battery_level')::int) else t.battery_level end,
    last_latitude = coalesce(nullif(p ->> 'latitude', '')::double precision, t.last_latitude),
    last_longitude = coalesce(nullif(p ->> 'longitude', '')::double precision, t.last_longitude),
    last_push_at = now()
  where t.collaborator_id = v_me and t.deleted_at is null;
end $function$;

revoke all on function public.mobile_report_device(jsonb) from public, anon;
grant execute on function public.mobile_report_device(jsonb) to authenticated;
