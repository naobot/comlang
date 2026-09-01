# comlang — notes for future sessions

Collaborative conlang management: two users (owner + collaborator) editing one conlang,
Vue 3 + Pinia + Vue Router on Supabase (Postgres + Auth + RLS + Realtime).

**Sibling repos, each with its own `.git`** — `/Users/nao/code/xenolinguistics/` is not
itself a repo:

- `../xenolinguistics-harness` — the eval harness. **`packages/own-conlang/grammar.yaml`
  is the real, validated model of the conlang** and is what the linguistic core schema
  should be derived from when it is designed. Read it before proposing tables.
- `../conlang/docs` — the co-designer's Notion export (`overview.md`, two vocab CSVs).
- `../project-wiki-web` — the write-up site. React, not Vue; useful only as the
  precedent for this repo's toolchain choices.

## What exists, and what deliberately does not

Built: the **access layer** (`projects`, `project_members`, RLS), auth, the dashboard,
and the project workspace *shell*.

Not built, on purpose: the **linguistic core** (phonemes, phonotactics, word classes,
lexicon, grammar rules). It needs a collaborative design pass first — the nav items in
`ProjectWorkspaceView.vue` are placeholders, not stubs waiting to be filled in blind.
Also deferred: changelog/version history, and any public/private flag on `projects`.

## Gotchas that will otherwise be rediscovered as bugs

**Realtime deletes are neither filtered nor authorized.** A subscription filtered to
`project_id=eq.<id>` still receives DELETE events for rows in *every* project, and RLS
is not applied to DELETE at all. With `replica identity full` under RLS, the `old`
record carries **only the primary key**. So `onDelete` in
`src/composables/useProjectChannel.ts` gets a bare id off an unfiltered stream: it must
stay "drop this id if I hold it," and an unknown id must remain a silent no-op. INSERT
and UPDATE *are* filtered and RLS-checked; only deletes are the odd ones out.

**A blocked write is not an error.** RLS filters rows, it does not raise: a
collaborator's `update` on a project simply matches zero rows and returns `null`.
`updateProject` in `src/stores/projects.ts` checks for that and says so, because
otherwise a denied rename looks identical to a successful one.

**Subscribe before you fetch.** There is a live window between `SUBSCRIBED` firing and
the binding actually delivering rows; a change made in it is never delivered, at all.
Subscribing first means the follow-up fetch covers that window. Fetching first leaves a
permanent hole between the query returning and the channel attaching. Observed directly:
an insert issued immediately after `SUBSCRIBED` produced no event, while the same insert
a couple of seconds later did.

**Channels are reference-counted, and stores own them — never components.** One row can
appear in several places at once (a lexicon entry in a list and inside a grammar rule
that cites it). Two channels would double-apply every event. Subscribe through
`subscribeToTable` / `subscribeToProjectTable` and release exactly once.

**Writers receive the echo of their own writes.** Every mutation is applied by id
(`byId` map in `src/stores/projects.ts`), never appended, or a create shows up twice.

**RLS policies must not read `project_members` directly.** That recurses. Go through
`private.is_project_member()` / `private.is_project_owner()` — `security definer` with a
pinned `search_path`, which is what breaks the cycle. Every future project-scoped table
reuses them, so its policies are copy-paste.

They live in the **`private` schema, not `public`**, so PostgREST does not publish them
as `/rest/v1/rpc/...` endpoints; the security advisor flags any security-definer
function that is reachable that way. `create_project` stays in `public` because it is
meant to be called over RPC, and its advisor warning is expected. Note that migration
0002 predates this move — copy the policy pattern from 0004.

**`profiles` is the only readable mirror of `auth.users`.** The client cannot query
`auth.users`, so without it there is no way to turn an email into a user id or show a
member list as anything but UUIDs. A trigger keeps it in sync on signup and on email
change. It is **not a directory**: the select policy exposes your own row plus people
you already share a project with, via `private.shares_project_with()`.

`project_members.user_id` carries a second foreign key to `profiles` purely so PostgREST
can embed it — `select("*, profile:profiles(...)")` fails with "could not find the
relation" without it, and the generated types catch that at compile time.

**Adding a member goes through `add_project_member(project_id, email, role)`**, which is
security-definer and checks ownership itself, because the caller cannot see the profile
of someone they do not yet share a project with — which is exactly everyone they are
about to invite. It resolves only existing accounts; there is no invite email. Note it
does let an owner discover whether an email has an account.

**Trigger functions must not be grantable.** `sync_profile_from_auth_user` and
`touch_updated_at` had EXECUTE for `anon`/`authenticated`, which published them as RPC
endpoints; 0007 revokes it. Triggers fire as the table owner, so this does not break
them — confirmed by signing a user up afterwards. Do the same for any future trigger
function.

**`projects` has no INSERT policy.** A new project has no members, so a member check
could never pass and an open check would let someone strand an unreadable row. Creation
goes through the `create_project()` RPC, which writes the project and its owner
membership in one transaction.

**`vp check` does not type-check this project.** tsgolint cannot resolve `.vue` modules
and reports a phantom TS2307 on every SFC import, so `typeAware`/`typeCheck` are off in
`vite.config.ts`. oxlint's `vue` plugin is script-block only — **there is no template
rule in it**. `vue-tsc` is the only thing checking SFC templates; that is why
`pnpm check` runs `vp check` *and* `vue-tsc --build`. Don't "simplify" it to one.

## Database workflow

**There is no local stack** — Docker isn't installed here, so `supabase start` and
`supabase db diff` are both unavailable. Migrations in `supabase/migrations/` are
**written by hand** and pushed to the hosted project:

```
npx supabase link --project-ref <ref>
npx supabase db push
```

Regenerate `src/types/database.ts` with `pnpm gen:types` in the same commit as any
migration that changes a table. That file is generated output — never hand-edit it.
Readable aliases live beside it in `src/types/models.ts`; import `Project` from there,
so a regeneration only has one file to reconcile.

The CLI is not logged in on this machine (`supabase login`, or `SUPABASE_ACCESS_TOKEN`),
so migrations so far were applied through the Supabase MCP tools. Either route is fine;
what matters is that `supabase/migrations/` keeps matching what is actually deployed.

Verify policies in the SQL editor before trusting them, and test the **negative**
direction — that a non-member sees nothing. RLS failures surface as empty result sets,
not errors, so a broken policy looks exactly like an empty database.

What was verified when the access layer went in (2026-09-01), against the live project:
owner sees own project / non-member sees zero rows / non-member cannot self-add /
direct `insert into projects` rejected / owner can add a collaborator / collaborator
then sees the project / collaborator cannot rename or delete it. Over the REST API:
anonymous select returns `[]`, anonymous `create_project` is denied, and
`/rest/v1/rpc/is_project_member` returns 404 because the helpers are not in an exposed
schema. Realtime was confirmed to deliver a full row on UPDATE and **only `{id}` on
DELETE**, as the migration comments claim.

`auth.users` rows inserted by hand need their token columns set to `''` rather than
NULL, or sign-in fails with GoTrue's opaque "Database error querying schema".

## Package manager

pnpm, via Vite+ (`vp`), which also manages the Node runtime. Plain `npx`/`npm` fails
with `EBADDEVENGINES` — use `vp install`, `vpr <script>`, or `./node_modules/.bin/<bin>`.
