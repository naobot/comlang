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
the project workspace *shell* — a navy-on-white header with the conlang name and a gear
menu at the left, section tabs across the middle, and the app name at the right — and the
first two linguistic-core sections, the **phoneme inventory** and **phonotactics**.

Not built, on purpose: the rest of the **linguistic core** (word classes, lexicon,
grammar rules, orthography). Each needs its own design pass — those tabs render
`SectionPlaceholderView.vue`; they are placeholders, not stubs waiting to be filled in
blind. Also deferred: changelog/version history, and any public/private flag.

## Gotchas that will otherwise be rediscovered as bugs

**`src/lib/phonotactics.ts` is pure, and that is the whole point of it.** No imports
from `vue`, `pinia`, or the Supabase client — a future word-generator feature imports it
unchanged, and the moment it reaches for the database it stops being reusable and becomes
this page's internals. `phonotactics.test.ts` asserts the import list is empty rather than
trusting the comment; that guard was checked to actually fail when violated.

**Its attempt cap is load-bearing.** An over-constrained grammar — a constraint forbidding
the only nucleus class — has no satisfying word, and an unbounded resample would hang the
tab. `generateWord` returns `{ ok: false, reason }` instead. Keep failure as data.

**Two different echo-detection strategies, deliberately.** `phonemes.ts` tracks the ids it
wrote (`ownWrites`); `phonotactics.ts` debounces a re-fetch and *compares* against what it
holds. The second is provably right rather than approximately right, and it exists because
one phonotactics save writes across five tables at once, where id bookkeeping would be
fragile. Copy the comparison approach for any future multi-table page.

**`save_phonotactics` clears slots before it deletes classes.** `syllable_slots.class_id`
is `on delete restrict` so a class cannot vanish from under a live template — which also
means a legitimate "remove the class and the slots using it" save has to empty the slots
first or it trips its own guard. The ordering inside that function is not incidental.

**Class and template ids survive a save**, because the RPC upserts on the natural key
(`symbol`, `name`) rather than recreating. Slots and constraints reference class ids, so
delete-and-recreate would churn every foreign key on every save. Verified directly.

**A rule's phoneme terms are IPA text, not foreign keys, and that is deliberate.**
0010 made them `references phonemes(id) on delete cascade`, so removing /ŋ/ *deleted* the
rule "ŋ cannot be an onset" — something a person deliberately wrote, gone with nothing to
reconstruct it from. 0012 traded the foreign key for text so the reference is allowed to
dangle, because a dangling reference is what lets the UI show the rule in red rather than
lose it. The database therefore no longer guarantees a rule names a segment that exists;
it cannot, if the rule is to survive. `orphanedTerms` / `orphanedConstraints` in
`src/lib/phonotactics.ts` do that check instead, against the **saved** inventory.

An orphaned rule is inert rather than wrong: the segment is gone from every class too, so
nothing generated can carry it. Inert is a quieter failure than deleted, which is why the
phonotactics page banners it and the constraint list outlines it in red.

Class terms keep their foreign key — deleting a class is an explicit act on the
phonotactics page, where `removeClass` already prunes the rules that used it, so there is
no silent loss to prevent.

**Class membership still cascades**, so removing a phoneme does drop it from every class.
`impactOfRemoving` reports that alongside the orphaned rules, and the inventory page shows
both before Save. Any future table hanging off `phonemes` needs the same decision made
deliberately: cascade and warn, or store the symbol and flag the orphan.

**The phoneme inventory inverts the realtime rule: it notifies, it never patches.**
Every other store applies events to its state. `src/stores/phonemes.ts` does not — the
page saves explicitly, so a collaborator's insert landing in the draft would rewrite an
edit in progress and then be written back on Save as if the user had chosen it. Events
set `changedElsewhere`; the user decides whether to reload. Any future
explicit-save section should copy this store, not `projects.ts`.

That store also keeps an `ownWrites` id set, because **a writer receives its own events**
and would otherwise raise "changed by someone else" against its own save. Only ids the
save actually *changed* go in — putting an unchanged row's id there leaves an entry
nothing ever consumes, which then swallows a collaborator's later delete of that row.

**The IPA chart is static data, not a table.** `src/data/ipa.ts` is identical for every
project, so a table would add a join and a fetch for nothing; `phonemes` stores only
which symbols are selected. Its feature labels (place, manner, voicing) are the IPA's
own, a way to find a symbol on a grid — **not a claim about the conlang**, whose notes
deliberately leave voicing and manner underspecified (`conlang/docs/overview.md:10`).
`phonemes.kind` is denormalized rather than derived so downstream SQL can ask for "the
vowels" without the module, and so revising the chart cannot change what a stored row
meant. `src/data/ipa.test.ts` pins the invariants — chiefly no duplicate symbol, since a
duplicate would silently make two chart cells toggle as one phoneme.

**Sections declare dependencies with `meta.requires`.** Phonotactics, word classes,
lexicon and grammar all carry `requires: "phonemes"`, and `SectionPlaceholderView`
renders a "set up the inventory first" notice instead of the generic placeholder when
the inventory is empty. Soft gate on purpose: the tab stays navigable, so the header
never shows a dead control. `ProjectWorkspaceView` loads the inventory for the same
reason it loads membership — pages that don't own the data still have to ask about it.

**Content is member-editable; owner-only is for settings and membership.** The
`phonemes` policies grant all four verbs to any member. A collaborator who could not
edit the language would have nothing to collaborate on.

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

**`ProjectWorkspaceView` owns the members fetch, not the Members tab.** `members.isOwner`
gates the header's gear menu and the settings form, which exist on every tab — fetching
membership only where the list renders would leave `isOwner` false everywhere else, and
an owner would lose their own controls by navigating. `ProjectMembers.vue` therefore
renders and mutates only; it does not subscribe.

**Header tabs are child routes, listed once in `projectTabs`** (`src/router/index.ts`).
`AppHeader` imports that array rather than filtering `router.getRoutes()`; `members` and
`settings` are children too but deliberately absent from it, since they hang off the gear
menu. Adding a linguistic-core section means a child route plus a line in `projectTabs`.

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

**Tests import from `vite-plus/test`, not `vitest`.** Vitest is bundled by Vite+ rather
than being a direct dependency, so `from "vitest"` runs but does not type-check, and the
`vite-plus/prefer-vite-plus-imports` lint rule exists to catch exactly this.

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

What was verified when the phoneme inventory went in (2026-09-01): as a **collaborator**
(not the owner) `save_phoneme_inventory` inserts, deletes only what was dropped, and
leaves surviving rows' **ids stable** — later tables will reference those ids, so a save
that churned them would be a slow-motion data bug. An empty array clears the inventory;
a non-member is refused with 42501 rather than silently writing nothing; an anonymous
call is refused at the grant. Over Realtime with two signed-in clients: inserts and
deletes both arrive, the delete carrying **only the primary key**, and every event id was
attributable to a save the client had made — which is the premise `ownWrites` rests on.

What was verified when phonotactics went in (2026-09-01): as a **collaborator**,
`save_phonotactics` writes all five tables in one call; a re-save that relabels a class and
drops another keeps the surviving classes' **ids stable**; a class still referenced by a
slot cannot be deleted directly (`on delete restrict`) while the save that removes both
together succeeds; `kind_shape` rejects a `forbid_sequence` carrying one term; a class
member that is not in the inventory is refused by name. Over PostgREST with two signed-in
clients: the collaborator's save round-tripped, the pure module generated well-formed words
from the read-back grammar with the ŋ-onset constraint holding, and the owner's channel saw
five events — which is what raises the banner.

After 0012, re-verified live: saving three rules and then removing /ŋ/ from the inventory
leaves **all three rules present**, exactly one detected as orphaned, and class C reduced
to `p s`. Before 0012 the same sequence destroyed the rule.

`auth.users` rows inserted by hand need their token columns set to `''` rather than
NULL, or sign-in fails with GoTrue's opaque "Database error querying schema".

## Package manager

pnpm, via Vite+ (`vp`), which also manages the Node runtime. Plain `npx`/`npm` fails
with `EBADDEVENGINES` — use `vp install`, `vpr <script>`, or `./node_modules/.bin/<bin>`.
