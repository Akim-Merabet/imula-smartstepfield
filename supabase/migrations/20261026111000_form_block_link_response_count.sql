-- Réponse unique sur mobile (spec 05 §4.7.2) : l'appareil ne reçoit que les réponses « mobile_visible » (limitées par
-- organizations.allowed_download_response), alors que le serveur refuse une seconde réponse dès qu'une réponse non
-- supprimée existe (UNIQUE_RESPONSE_EXISTS). Le nombre de réponses du lien est donc synchronisé avec le lien : sans lui,
-- l'opérateur pouvait remplir tout un formulaire hors ligne, rejeté à l'envoi.
alter table public.form_block_links add column response_count int not null default 0;

comment on column public.form_block_links.response_count is
  'Nombre de réponses non supprimées du lien (déclencheur sur form_responses) ; lu par l''app terrain pour la réponse unique.';

create or replace function private.form_block_link_refresh_response_count(p_block_link_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.form_block_links l
     set response_count = c.n
    from (select count(*)::int as n from public.form_responses r
           where r.block_link_id = p_block_link_id and r.deleted_at is null) c
   where l.id = p_block_link_id and l.response_count is distinct from c.n;
$$;

create or replace function private.form_responses_block_link_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.block_link_id is not null then
    perform private.form_block_link_refresh_response_count(old.block_link_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.block_link_id is not null
     and (tg_op = 'INSERT' or new.block_link_id is distinct from old.block_link_id) then
    perform private.form_block_link_refresh_response_count(new.block_link_id);
  end if;
  return null;
end $$;

create trigger form_responses_block_link_count
  after insert or delete or update of block_link_id, deleted_at on public.form_responses
  for each row execute function private.form_responses_block_link_count();

update public.form_block_links l
   set response_count = c.n
  from (select block_link_id, count(*)::int as n from public.form_responses
         where block_link_id is not null and deleted_at is null group by block_link_id) c
 where l.id = c.block_link_id;
