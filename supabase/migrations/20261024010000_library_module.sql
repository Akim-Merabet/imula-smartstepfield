-- =============================================================================
-- Module Bibliothèque (lot 3) : risques / parades, moyens, objets techniques, étiquettes.
-- Réf. spec 02 §5.4, §5.5, §5.10 ; spec 01 §6.6-6.8 ; spec 03 §3.7.
--  * auteur de création / dernière modification (modales « Propriétés ») ;
--  * description d'étiquette et d'objet, certificat de conformité → document de bibliothèque ;
--  * historique des valeurs d'attributs d'objet (saisie directe ou via une réponse de formulaire) ;
--  * bucket Storage privé « library » (photos, documents de moyen, PDF de parade).
-- =============================================================================

-- ===== AUTEURS ==================================================================
alter table public.library_equipments
  add column created_by uuid references public.collaborators(id) on delete set null,
  add column updated_by uuid references public.collaborators(id) on delete set null;
alter table public.library_risks
  add column created_by uuid references public.collaborators(id) on delete set null,
  add column updated_by uuid references public.collaborators(id) on delete set null;
alter table public.technical_objects
  add column created_by uuid references public.collaborators(id) on delete set null,
  add column updated_by uuid references public.collaborators(id) on delete set null,
  add column description text;
alter table public.tags
  add column created_by uuid references public.collaborators(id) on delete set null,
  add column updated_by uuid references public.collaborators(id) on delete set null,
  add column description text;

create index library_equipments_created_by_idx on public.library_equipments (created_by);
create index library_equipments_updated_by_idx on public.library_equipments (updated_by);
create index library_risks_created_by_idx on public.library_risks (created_by);
create index library_risks_updated_by_idx on public.library_risks (updated_by);
create index technical_objects_created_by_idx on public.technical_objects (created_by);
create index technical_objects_updated_by_idx on public.technical_objects (updated_by);
create index tags_created_by_idx on public.tags (created_by);
create index tags_updated_by_idx on public.tags (updated_by);

-- Certificat de conformité = document PDF de la bibliothèque (spec 02 §5.10, document « Objets » en annexe).
alter table public.technical_objects
  add constraint technical_objects_certificate_document_id_fkey
  foreign key (certificate_document_id) references public.documents(id) on delete set null;
create index technical_objects_certificate_idx on public.technical_objects (certificate_document_id);

create or replace function private.set_library_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.current_collaborator_id();
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, v_me); end if;
  new.updated_by := coalesce(v_me, new.updated_by);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['library_equipments','library_risks','technical_objects','tags']
  loop
    execute format('create trigger set_library_actor before insert or update on public.%I
                    for each row execute function private.set_library_actor()', t);
  end loop;
end $$;

-- ===== HISTORIQUE DES ATTRIBUTS D'OBJET =========================================
create table public.custom_field_value_history (
  id uuid primary key default gen_random_uuid(),
  custom_field_id uuid not null references public.custom_fields(id) on delete cascade,
  object_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  business_class public.business_class not null,
  old_value_text text,
  new_value_text text,
  old_value_json jsonb,
  new_value_json jsonb,
  source text not null default 'webapp' check (source in ('webapp','form_response','api','mobile')),
  response_id uuid references public.form_responses(id) on delete set null,
  changed_by uuid references public.collaborators(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index custom_field_value_history_object_idx on public.custom_field_value_history (object_id, changed_at desc);
create index custom_field_value_history_field_idx on public.custom_field_value_history (custom_field_id);
create index custom_field_value_history_account_idx on public.custom_field_value_history (account_id);
create index custom_field_value_history_response_idx on public.custom_field_value_history (response_id);
create index custom_field_value_history_by_idx on public.custom_field_value_history (changed_by);

alter table public.custom_field_value_history enable row level security;
-- Lecture seule côté API : les lignes sont écrites par le trigger ci-dessous.
create policy custom_field_value_history_select on public.custom_field_value_history for select to authenticated
  using (account_id in (select private.accessible_account_ids()));

create or replace function private.log_custom_field_value()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.value_text is not distinct from old.value_text
     and new.value_json is not distinct from old.value_json then
    return null;
  end if;
  if tg_op = 'INSERT' and new.value_text is null and new.value_json is null then
    return null;
  end if;
  insert into public.custom_field_value_history
    (custom_field_id, object_id, account_id, business_class, old_value_text, new_value_text, old_value_json, new_value_json,
     source, response_id, changed_by)
  values
    (new.custom_field_id, new.object_id, new.account_id, new.business_class,
     case when tg_op = 'UPDATE' then old.value_text end, new.value_text,
     case when tg_op = 'UPDATE' then old.value_json end, new.value_json,
     coalesce(nullif(current_setting('siteflow.cfv_source', true), ''), 'webapp'),
     nullif(current_setting('siteflow.cfv_response', true), '')::uuid,
     private.current_collaborator_id());
  return null;
end $$;

create trigger log_technical_object_value after insert or update on public.custom_field_values
  for each row when (new.business_class = 'technical_object')
  execute function private.log_custom_field_value();

-- Écriture des attributs d'un objet depuis une réponse de formulaire liée (spec 03 §3.7).
-- SECURITY INVOKER : la RLS de custom_field_values s'applique ; contrôle de la réponse et du lien en tête.
create or replace function public.technical_object_write_attributes(p_object_id uuid, p_response_id uuid, p_values jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_account uuid; v_count integer;
begin
  if p_response_id is null or not private.can_write_response(p_response_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.form_responses r join public.form_block_links l on l.id = r.block_link_id
                 where r.id = p_response_id and l.technical_object_id = p_object_id) then
    raise exception 'object_not_linked';
  end if;
  select account_id into v_account from public.technical_objects where id = p_object_id and deleted_at is null;
  if v_account is null then raise exception 'not_found'; end if;

  perform set_config('siteflow.cfv_source', 'form_response', true);
  perform set_config('siteflow.cfv_response', p_response_id::text, true);
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_at, updated_by)
  select f.id, p_object_id, v_account, 'technical_object', e->>'value_text',
         case when jsonb_typeof(e->'value_json') in ('null') or e->'value_json' is null then null else e->'value_json' end,
         now(), private.current_collaborator_id()
  from jsonb_array_elements(coalesce(p_values, '[]'::jsonb)) e
  join public.custom_fields f on f.id = (e->>'field_id')::uuid and f.nature = 'technical_object' and f.deleted_at is null
  on conflict (custom_field_id, object_id) do update
    set value_text = excluded.value_text, value_json = excluded.value_json,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  get diagnostics v_count = row_count;
  perform set_config('siteflow.cfv_source', '', true);
  perform set_config('siteflow.cfv_response', '', true);
  return v_count;
end $$;
revoke execute on function public.technical_object_write_attributes(uuid, uuid, jsonb) from public, anon;
grant execute on function public.technical_object_write_attributes(uuid, uuid, jsonb) to authenticated;

-- ===== STOCKAGE =================================================================
-- Bucket privé « library » : equipments/<equipment_id>/<fichier> (photo, document de référence, certificat),
--   risks/<risk_id>/parades/<fichier> (PDF des parades génériques).
insert into storage.buckets (id, name, public, file_size_limit)
values ('library', 'library', false, 41943040)
on conflict (id) do nothing;

create or replace function private.library_storage_access(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name); v_id uuid; v_org uuid; v_account uuid;
begin
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2
     or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := v_parts[2]::uuid;
  if v_parts[1] = 'equipments' then
    select organization_id, account_id into v_org, v_account from public.library_equipments where id = v_id;
  elsif v_parts[1] = 'risks' then
    select organization_id, account_id into v_org, v_account from public.library_risks where id = v_id;
  else
    return false;
  end if;
  if v_org is null then return false; end if;
  if p_write then
    return private.is_admin_or_advanced() and v_account in (select private.accessible_account_ids());
  end if;
  return v_org = private.current_org_id();
end $$;

drop policy if exists library_storage_select on storage.objects;
create policy library_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'library' and private.library_storage_access(name, false));
drop policy if exists library_storage_insert on storage.objects;
create policy library_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'library' and private.library_storage_access(name, true));
drop policy if exists library_storage_update on storage.objects;
create policy library_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'library' and private.library_storage_access(name, true))
  with check (bucket_id = 'library' and private.library_storage_access(name, true));
drop policy if exists library_storage_delete on storage.objects;
create policy library_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'library' and private.library_storage_access(name, true));

-- ===== UTILISATIONS (suppression bloquée si l'élément est utilisé) ==============
-- Compte les usages hors périmètre RLS de l'appelant (blocs de flows d'autres entités).
create or replace function private.library_item_usage(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v jsonb;
begin
  if p_kind = 'equipment' then
    if not exists (select 1 from public.library_equipments where id = p_id and organization_id = v_org) then return null; end if;
    v := jsonb_build_object(
      'blocks', (select count(*) from public.block_emm_items where library_equipment_id = p_id),
      'lists', (select count(*) from public.project_list_items where equipment_id = p_id));
  elsif p_kind = 'risk' then
    if not exists (select 1 from public.library_risks where id = p_id and organization_id = v_org) then return null; end if;
    v := jsonb_build_object(
      'blocks', (select count(*) from public.block_adr_items where library_risk_id = p_id),
      'lists', (select count(*) from public.project_list_items where risk_id = p_id));
  elsif p_kind = 'object' then
    if not exists (select 1 from public.technical_objects where id = p_id and organization_id = v_org) then return null; end if;
    v := jsonb_build_object(
      'blocks', (select count(*) from public.block_object_items where technical_object_id = p_id),
      'flows', (select count(*) from public.flows where technical_object_id = p_id),
      'forms', (select count(*) from public.form_block_links where technical_object_id = p_id),
      'children', (select count(*) from public.technical_objects where parent_id = p_id and deleted_at is null));
  elsif p_kind = 'tag' then
    if not exists (select 1 from public.tags where id = p_id and organization_id = v_org) then return null; end if;
    v := jsonb_build_object(
      'links', (select count(*) from public.flow_tags where tag_id = p_id)
             + (select count(*) from public.phase_tags where tag_id = p_id)
             + (select count(*) from public.step_tags where tag_id = p_id),
      'children', (select count(*) from public.tags where parent_id = p_id));
  else
    return null;
  end if;
  return v;
end $$;

create or replace function public.library_item_usage(p_kind text, p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.library_item_usage(p_kind, p_id)
$$;

revoke execute on function private.set_library_actor(), private.log_custom_field_value(),
  private.library_storage_access(text, boolean), private.library_item_usage(text, uuid) from public, anon;
grant execute on function private.library_storage_access(text, boolean), private.library_item_usage(text, uuid) to authenticated;
revoke execute on function public.library_item_usage(text, uuid) from public, anon;
grant execute on function public.library_item_usage(text, uuid) to authenticated;
