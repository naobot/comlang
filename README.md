# comlang

Collaborative conlang management. Vue 3 + TypeScript + Pinia on Supabase.

## Setup

```sh
vp install
cp .env.example .env.local   # fill in from the Supabase dashboard
vp dev
```

The publishable key belongs in the bundle; row-level security is the actual access
boundary. Never put the secret / `service_role` key in this repo.

## Database

Migrations are hand-written in `supabase/migrations/` and applied to the hosted project
(there is no local stack — Docker is not available here):

```sh
npx supabase link --project-ref <ref>
npx supabase db push
pnpm gen:types              # regenerate src/types/database.ts
```

## Checks

```sh
vpr check    # oxfmt + oxlint, then vue-tsc (which is what checks SFC templates)
vpr build
```

See `CLAUDE.md` for the constraints behind these choices.
