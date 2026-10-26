-- Vocabulaire de l'organisation : terme affiché pour désigner les flows (« Flow » ou « Procédure »).
-- Écart volontaire à l'outil d'origine (toujours « flow ») : seul le texte affiché change (WebApp, PDF, app terrain),
-- les tables, routes et API gardent « flow ». Liste fermée : chaque terme a ses libellés relus (accords, pluriels).
create type public.flow_term as enum ('flow', 'procedure');

alter table public.organizations add column flow_term public.flow_term not null default 'flow';

comment on column public.organizations.flow_term is
  'Terme affiché pour désigner les flows dans l''interface (libellés de messages/<langue>.<terme>/ et du mobile).';
