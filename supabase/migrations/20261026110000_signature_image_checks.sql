-- Images de signature : seules une image en ligne (data:image/png|jpeg, 400 000 caractères au plus, comme la WebApp)
-- ou un chemin de stockage (sans schéma d'URL) sont acceptés. Les fonctions mobiles (SECURITY DEFINER) enregistraient
-- toute valeur fournie par l'appareil : une URL http(s) aurait été téléchargée par le serveur à la génération des PDF.
-- Contrainte de table : couvre tous les chemins d'écriture (RPC mobiles, WebApp, API).
create or replace function private.is_safe_signature_image(p text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select p is null
      or (p ~ '^data:image/(png|jpeg);base64,' and length(p) <= 400000)
      or (p !~ '^[A-Za-z][A-Za-z0-9+.-]*:' and length(p) <= 1024)
$function$;

alter table public.signatures
  add constraint signatures_signature_path_safe check (private.is_safe_signature_image(signature_path));
alter table public.block_multi_pr_signatures
  add constraint block_multi_pr_signatures_signature_path_safe check (private.is_safe_signature_image(signature_path));
alter table public.flow_fill_unlocks
  add constraint flow_fill_unlocks_signature_path_safe check (private.is_safe_signature_image(signature_path));
alter table public.collaborators
  add constraint collaborators_signature_path_safe check (private.is_safe_signature_image(signature_path));
