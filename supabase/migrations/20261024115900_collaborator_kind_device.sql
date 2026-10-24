-- App mobile terrain : valeur d'enum « appareil » (spec 05 §9.2).
-- Fichier séparé : une nouvelle valeur d'enum ne peut pas être utilisée dans la transaction qui la crée.
alter type public.collaborator_kind add value if not exists 'device';
