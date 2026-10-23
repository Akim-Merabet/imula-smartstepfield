-- =============================================================================
-- Bibliothèque (socle nécessaire aux blocs de flows) : moyens (EMM), risques (ADR)
-- et parades, étiquettes, objets techniques. Réf. specs 02 §5.4-5.5, 5.10.
-- =============================================================================

-- ===== MOYENS (équipements, matériels, matériaux) ===============================
create table public.library_equipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  family_id uuid not null references public.label_families(id),
  name text not null check (char_length(name) between 1 and 255),
  reference text,
  provider text,
  quantity_unit text,
  consumable boolean not null default false,
  subject_to_verification boolean not null default false,
  validity_date date,
  verification_body text,
  photo_path text,
  reference_document_path text,
  certificate_document_path text,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_equipments_account_idx on public.library_equipments (account_id) where deleted_at is null;
create index library_equipments_family_idx on public.library_equipments (family_id);
create index library_equipments_org_idx on public.library_equipments (organization_id);

-- ===== RISQUES ET PARADES ======================================================
create table public.library_risks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  family_id uuid not null references public.label_families(id),
  name text not null check (char_length(name) between 1 and 255),
  source text,
  reference text,
  landmark text,
  pictogram smallint check (pictogram between 1 and 240),
  major boolean not null default false,
  frequency smallint,
  occurrence smallint,
  severity smallint,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index library_risks_account_idx on public.library_risks (account_id) where deleted_at is null;
create index library_risks_family_idx on public.library_risks (family_id);
create index library_risks_org_idx on public.library_risks (organization_id);

create table public.library_risk_parades (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.library_risks(id) on delete cascade,
  name text not null,
  description text,
  pictogram smallint check (pictogram between 1 and 240),
  file_path text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index library_risk_parades_risk_idx on public.library_risk_parades (risk_id);

-- ===== ÉTIQUETTES (arborescence) ===============================================
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  parent_id uuid references public.tags(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  color text not null default '#64748b',
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tags_org_idx on public.tags (organization_id);
create index tags_account_idx on public.tags (account_id);
create index tags_parent_idx on public.tags (parent_id);

-- ===== OBJETS TECHNIQUES =======================================================
create table public.technical_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  family_id uuid not null references public.label_families(id),
  parent_id uuid references public.technical_objects(id) on delete set null,
  name text not null check (char_length(name) between 1 and 255),
  item_code text,            -- « Code article » (ex-référence interne)
  external_reference text,
  identification_number text,
  object_index text,
  custom_status_id uuid references public.custom_statuses(id),
  certificate_document_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index technical_objects_account_idx on public.technical_objects (account_id) where deleted_at is null;
create index technical_objects_family_idx on public.technical_objects (family_id);
create index technical_objects_parent_idx on public.technical_objects (parent_id);
create index technical_objects_status_idx on public.technical_objects (custom_status_id);
create unique index technical_objects_ident_unique on public.technical_objects (organization_id, identification_number)
  where identification_number is not null and deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['library_equipments','library_risks','tags','technical_objects']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ===== RLS ======================================================================
alter table public.library_equipments   enable row level security;
alter table public.library_risks        enable row level security;
alter table public.library_risk_parades enable row level security;
alter table public.tags                 enable row level security;
alter table public.technical_objects    enable row level security;

-- Lecture : toute l'organisation (la bibliothèque est filtrable par applicabilité dans l'IHM).
create policy library_equipments_select on public.library_equipments for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy library_equipments_write on public.library_equipments for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));

create policy library_risks_select on public.library_risks for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy library_risks_write on public.library_risks for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));

create policy library_risk_parades_select on public.library_risk_parades for select to authenticated
  using (exists (select 1 from public.library_risks r where r.id = risk_id
                 and r.organization_id = (select private.current_org_id())));
create policy library_risk_parades_write on public.library_risk_parades for all to authenticated
  using ((select private.is_admin_or_advanced()) and exists (select 1 from public.library_risks r where r.id = risk_id
                 and r.account_id in (select private.accessible_account_ids())))
  with check ((select private.is_admin_or_advanced()));

create policy tags_select on public.tags for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy tags_write on public.tags for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin_or_advanced())
         and (account_id is null or account_id in (select private.accessible_account_ids())))
  with check (organization_id = (select private.current_org_id()));

create policy technical_objects_select on public.technical_objects for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy technical_objects_write on public.technical_objects for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));
