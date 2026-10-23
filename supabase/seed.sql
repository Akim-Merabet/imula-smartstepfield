-- Données de démonstration locales (supabase db reset).
-- Connexion : admin@demo.local / Demo-Password-2026!

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_acc uuid := '00000000-0000-4000-8000-000000000002';
  v_company uuid := '00000000-0000-4000-8000-000000000003';
  v_user uuid := '00000000-0000-4000-8000-000000000010';
  v_collab uuid := '00000000-0000-4000-8000-000000000011';
  v_client uuid := '00000000-0000-4000-8000-000000000020';
  v_fam_project uuid; v_fam_project_child uuid;
  v_fam_flow uuid; v_fam_flow_child uuid;
  v_fam_form uuid; v_fam_form_child uuid;
  v_fam_function uuid; v_fam_function_child uuid;
  v_fam_team uuid; v_fam_team_child uuid;
  v_fam_equipment uuid; v_fam_equipment_child uuid;
  v_fam_risk uuid; v_fam_risk_child uuid;
  v_fam_device uuid; v_fam_device_child uuid;
  v_fam_skill uuid; v_fam_skill_child uuid;
  v_project uuid := '00000000-0000-4000-8000-000000000100';
  v_status_project uuid;
begin
  insert into public.organizations (id, name, subdomain) values (v_org, 'Organisation démo', 'demo');
  insert into public.accounts (id, organization_id, name, address_line_1, postal_code, city, country)
    values (v_acc, v_org, 'Compte démo', '1 rue de la Démo', '75001', 'Paris', 'France');
  insert into public.companies (id, organization_id, account_id, name, activity_area, is_parent_company)
    values (v_company, v_org, v_acc, 'Société démo', 'Industrie', true);

  -- Utilisateur auth + collaborateur administrateur
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', 'admin@demo.local',
          extensions.crypt('Demo-Password-2026!', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_user, v_user::text,
          jsonb_build_object('sub', v_user::text, 'email', 'admin@demo.local', 'email_verified', true),
          'email', now(), now(), now());

  -- Familles : un parent + un enfant par nature utile
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name, color)
    values (v_org, 'family', 'project', 'parent', 'PRJ', 'Projets', '#0d4e8a') returning id into v_fam_project;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name, color)
    values (v_org, 'family', 'project', 'child', v_fam_project, 'MAINT', 'Maintenance', '#2f80ed') returning id into v_fam_project_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name, color)
    values (v_org, 'family', 'flow', 'parent', 'FLW', 'Interventions', '#27ae60') returning id into v_fam_flow;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name, color)
    values (v_org, 'family', 'flow', 'child', v_fam_flow, 'MEC', 'Mécanique', '#219653') returning id into v_fam_flow_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name, color)
    values (v_org, 'family', 'form', 'parent', 'QUA', 'Qualité', '#9b51e0') returning id into v_fam_form;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name, color)
    values (v_org, 'family', 'form', 'child', v_fam_form, 'CTRL', 'Contrôles', '#bb6bd9') returning id into v_fam_form_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'function', 'parent', 'FCT', 'Fonctions') returning id into v_fam_function;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'function', 'child', v_fam_function, 'TECH', 'Technicien') returning id into v_fam_function_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'team', 'parent', 'GRP', 'Groupes') returning id into v_fam_team;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'team', 'child', v_fam_team, 'EQA', 'Équipe A') returning id into v_fam_team_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'equipment', 'parent', 'OUT', 'Outillage') returning id into v_fam_equipment;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'equipment', 'child', v_fam_equipment, 'MAN', 'Manuel') returning id into v_fam_equipment_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'risk', 'parent', 'SEC', 'Sécurité') returning id into v_fam_risk;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'risk', 'child', v_fam_risk, 'ELEC', 'Électrique') returning id into v_fam_risk_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'device', 'parent', 'TAB', 'Tablettes') returning id into v_fam_device;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'device', 'child', v_fam_device, 'TERR', 'Terrain') returning id into v_fam_device_child;
  insert into public.label_families (organization_id, kind, nature, relative_nature, short_name, long_name)
    values (v_org, 'family', 'skill', 'parent', 'HAB', 'Habilitations') returning id into v_fam_skill;
  insert into public.label_families (organization_id, kind, nature, relative_nature, parent_id, short_name, long_name)
    values (v_org, 'family', 'skill', 'child', v_fam_skill, 'B1V', 'Habilitation B1V') returning id into v_fam_skill_child;

  insert into public.collaborators (id, organization_id, account_id, auth_user_id, kind, first_name, last_name, trigram,
                                    email, authority, additional_rights, company_id, function_id, group_id, status, language)
  values (v_collab, v_org, v_acc, v_user, 'user', 'Alice', 'Admin', 'AAD', 'admin@demo.local', 'global_admin',
          '{generic_form,model_form,manage_diffusion}', v_company, v_fam_function_child, v_fam_team_child, 'active', 'fr');

  -- Statuts par défaut
  insert into public.custom_statuses (organization_id, account_id, nature, name, color, category, is_default, sort_order)
  values
    (v_org, v_acc, 'project', 'En préparation', '#f2994a', 'in_preparation', true, 1),
    (v_org, v_acc, 'project', 'En cours', '#2f80ed', 'in_progress', false, 2),
    (v_org, v_acc, 'project', 'Terminé', '#27ae60', 'done', false, 3),
    (v_org, v_acc, 'flow', 'À faire', '#828282', 'todo', false, 1),
    (v_org, v_acc, 'flow', 'En préparation', '#f2994a', 'in_preparation', true, 2),
    (v_org, v_acc, 'flow', 'En opération', '#2f80ed', 'in_operation', false, 3),
    (v_org, v_acc, 'flow', 'En cours', '#56ccf2', 'in_progress', false, 4),
    (v_org, v_acc, 'flow', 'Terminé', '#27ae60', 'done', false, 5),
    (v_org, null, 'form', 'Actif', '#27ae60', 'todo', true, 1),
    (v_org, null, 'form', 'Inactif', '#828282', 'todo', false, 2),
    (v_org, null, 'form_response', 'À traiter', '#f2994a', 'todo', true, 1),
    (v_org, null, 'form_response', 'Traité', '#27ae60', 'done', false, 2),
    (v_org, v_acc, 'multi_pr', 'Conforme', '#27ae60', 'todo', false, 1),
    (v_org, v_acc, 'multi_pr', 'Non conforme', '#eb5757', 'todo', false, 2),
    (v_org, null, 'technical_object', 'En service', '#27ae60', 'todo', true, 1);
  update public.custom_statuses set importable = true, downloadable = true, exportable = true
    where organization_id = v_org and nature in ('form','form_response');

  select id into v_status_project from public.custom_statuses
    where organization_id = v_org and nature = 'project' and is_default;

  insert into public.clients (id, account_id, name, address, zip_code, city, country)
    values (v_client, v_acc, 'Client démo', '10 avenue du Client', '69001', 'Lyon', 'France');

  insert into public.projects (id, organization_id, account_id, type, designation, client_id, family_id, custom_status_id,
                               business_ref, location_label, description, created_by, updated_by)
  values (v_project, v_org, v_acc, 'project', 'Maintenance site de Lyon', v_client, v_fam_project_child, v_status_project,
          'AFF-0001', 'Lyon', 'Projet de démonstration', v_collab, v_collab);
  insert into public.project_members (project_id, collaborator_id, role) values (v_project, v_collab, 'responsible');

  insert into public.library_equipments (organization_id, account_id, family_id, name, reference, provider, quantity_unit)
    values (v_org, v_acc, v_fam_equipment_child, 'Clé dynamométrique', 'CD-200', 'Facom', 'u'),
           (v_org, v_acc, v_fam_equipment_child, 'Multimètre', 'MM-15', 'Fluke', 'u');
  insert into public.library_risks (organization_id, account_id, family_id, name, source, pictogram, major)
    values (v_org, v_acc, v_fam_risk_child, 'Électrocution', 'Armoire électrique', 12, true),
           (v_org, v_acc, v_fam_risk_child, 'Chute de plain-pied', 'Sol glissant', 30, false);
end $$;
