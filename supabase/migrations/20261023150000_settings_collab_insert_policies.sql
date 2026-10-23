-- Paramètres / Collaborateurs : la scission des politiques « FOR ALL » (20261023130352) a produit des
-- politiques INSERT ne reprenant que le WITH CHECK, donc sans le contrôle de droit (admin, admin global…).
-- On rétablit le contrôle de droit à l'insertion pour les dictionnaires et objets des modules
-- Paramètres et Collaborateurs (spec 01 §3.5).

drop policy if exists clients_write_ins on public.clients;
create policy clients_write_ins on public.clients for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()));

drop policy if exists companies_write_ins on public.companies;
create policy companies_write_ins on public.companies for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.current_authority()) in ('global_admin','siteflow_admin'));

drop policy if exists custom_fields_write_ins on public.custom_fields;
create policy custom_fields_write_ins on public.custom_fields for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin()));

drop policy if exists custom_statuses_write_ins on public.custom_statuses;
create policy custom_statuses_write_ins on public.custom_statuses for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin())
              and (account_id is null or account_id in (select private.accessible_account_ids())));

drop policy if exists reference_rules_write_ins on public.reference_rules;
create policy reference_rules_write_ins on public.reference_rules for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin()));

drop policy if exists label_families_write_ins on public.label_families;
create policy label_families_write_ins on public.label_families for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (account_id is null or account_id in (select private.accessible_account_ids()))
              and case when project_id is null then (select private.is_admin())
                       else (select private.can_write_project(project_id, 'expert')) end);

drop policy if exists tablets_write_ins on public.tablets;
create policy tablets_write_ins on public.tablets for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()));

drop policy if exists external_users_write_ins on public.external_users;
create policy external_users_write_ins on public.external_users for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.current_authority()) = 'siteflow_admin');

drop policy if exists authorized_devices_all_ins on public.authorized_devices;
create policy authorized_devices_all_ins on public.authorized_devices for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.is_admin_or_advanced()));

drop policy if exists wording_write_ins on public.wording_configurations;
create policy wording_write_ins on public.wording_configurations for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and (select private.current_authority()) = 'siteflow_admin');

drop policy if exists wording_lang_write_ins on public.wording_configuration_languages;
create policy wording_lang_write_ins on public.wording_configuration_languages for insert to authenticated
  with check ((select private.current_authority()) = 'siteflow_admin'
              and exists (select 1 from public.wording_configurations w
                          where w.id = wording_configuration_id and w.organization_id = (select private.current_org_id())));

drop policy if exists collab_skills_write_ins on public.collaborator_skills;
create policy collab_skills_write_ins on public.collaborator_skills for insert to authenticated
  with check ((select private.is_admin()) and exists (select 1 from public.collaborators c where c.id = collaborator_id
              and c.account_id in (select private.accessible_account_ids())));

drop policy if exists collab_hier_write_ins on public.collaborator_default_hierarchies;
create policy collab_hier_write_ins on public.collaborator_default_hierarchies for insert to authenticated
  with check ((select private.is_admin_or_advanced()) and exists (select 1 from public.collaborators c where c.id = collaborator_id
              and c.account_id in (select private.accessible_account_ids())));
