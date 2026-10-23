-- Paramètres > Organisation (spec 01 §6.3) : option « Activer le chat support » (widget d'assistance tiers).
alter table public.organizations add column if not exists support_chat_enabled boolean not null default false;
