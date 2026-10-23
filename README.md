# Imula Flow

Reconstruction fonctionnelle d'une application de préparation et d'exécution d'interventions terrain
(entités → flows → phases → étapes → blocs, formulaires, signatures), en **Next.js 16 + shadcn/ui + Tailwind v4 + Supabase**.

- Specs fonctionnelles : `docs/specs/` (00 shell, 01 entités/paramètres/collaborateurs, 02 flows, 03 formulaires)
- Sources de rétro-ingénierie : `docs/reverse/`
- Conventions de code : `docs/CONVENTIONS.md`

## Démarrer en local

```bash
pnpm install
supabase start          # ports dédiés 559xx (API :55921, Studio :55923, Mailpit :55924)
supabase db reset       # migrations + données de démo (supabase/seed.sql)
cp apps/web/.env.example apps/web/.env.local   # clés de `supabase status`
pnpm dev                # http://localhost:3030
```

Compte de démonstration : `admin@demo.local` / `Demo-Password-2026!`.

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` | serveur de développement (port 3030) |
| `pnpm build` / `pnpm start` | build et serveur de production |
| `pnpm lint` | ESLint |
| `pnpm test` | tests unitaires (vitest) |
| `scripts/check-migrations.sh` | rejoue migrations + seed dans une base jetable et compare au schéma de dev |
| `pnpm db:types` | régénère les types de la base (`packages/db`) |
| `pnpm powersync:up` | démarre le service PowerSync auto-hébergé (`infra/powersync`) |
