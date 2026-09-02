-- Public conlangs: a project may be published, and a published project is readable by
-- anyone, signed in or not.
--
-- Everything here is on the **read** side. Not one write policy is touched, and none of
-- them mentions `anon`: `anon` already holds the table-level INSERT/UPDATE/DELETE grants
-- Supabase gives it by default, so RLS is the only thing standing between an anonymous
-- request and a write, and the reason it holds is that every write policy is `to
-- authenticated` with a membership check. Any future policy on a project-scoped table must
-- keep that shape — a write policy naming `anon`, or one with no role list at all, would
-- hand the whole database to the internet.
--
-- What stays private in a public project:
--
--   * `project_members` — who is working on a language is not part of the language, and
--     the row embeds a profile, so publishing it would publish email addresses.
--   * `profiles` — unchanged, and 0006's reasoning stands: it is a lookup for people you
--     already share a project with, not a directory.
--
-- So an anonymous visitor sees the conlang and nothing about the people behind it. The
-- app follows: with no membership rows, `members.canEdit` is false and the workspace
-- renders read-only.

alter table public.projects
  add column is_public boolean not null default false;

comment on column public.projects.is_public is
  'Published: readable by anyone, signed in or not. Writes remain member-only.';

-- Public listings scan on this, and the dashboard shows them to signed-out visitors —
-- which is the one query in the app with no user to narrow it.
create index projects_public_idx on public.projects (is_public) where is_public;

-- The third helper, beside is_project_member / is_project_owner (0004).
--
-- It answers "may this row be read at all", which is a different question from membership
-- and has to be asked by a role that has no membership. `security definer` for the usual
-- reason: it reads `projects` and `project_members`, and doing that from inside a policy
-- on those same tables without bypassing RLS is how recursion starts.
--
-- Note the member branch is inlined rather than calling `private.is_project_member`. That
-- is deliberate: `anon` must not be granted execute on the membership helpers — this is
-- the only private function it may call, and it returns a single boolean about one project
-- id, which tells an anonymous caller nothing it could not learn by listing public
-- projects.
create or replace function private.is_project_visible(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and (
         p.is_public
         or exists (
           select 1 from public.project_members m
            where m.project_id = p.id
              and m.user_id = (select auth.uid())
         )
       )
  );
$$;

-- `anon` needs usage on the schema to call anything in it, and execute on this function
-- alone. is_project_member / is_project_owner stay revoked from anon, as 0004 left them.
grant usage on schema private to anon;
revoke execute on function private.is_project_visible(uuid) from public;
grant  execute on function private.is_project_visible(uuid) to anon, authenticated;

-- projects ---------------------------------------------------------------------------
-- Replaces 0004's member-only read. Update and delete are untouched and stay owner-only,
-- which is what keeps `is_public` itself an owner's decision.
drop policy "members read projects" on public.projects;

create policy "read visible projects" on public.projects
  for select to anon, authenticated
  using (private.is_project_visible(id));

-- The linguistic core ------------------------------------------------------------------
-- One policy per table, written out rather than looped: this is the boundary, and a
-- boundary should be greppable.

drop policy "members read phonemes" on public.phonemes;
drop policy "members read phoneme_classes" on public.phoneme_classes;
drop policy "members read class_members" on public.phoneme_class_members;
drop policy "members read templates" on public.syllable_templates;
drop policy "members read slots" on public.syllable_slots;
drop policy "members read constraints" on public.phonotactic_constraints;
drop policy "members read word_classes" on public.word_classes;
drop policy "members read categories" on public.grammatical_categories;
drop policy "members read category_values" on public.category_values;
drop policy "members read class_categories" on public.word_class_categories;
drop policy "members read lexicon" on public.lexicon_entries;
drop policy "members read grammar_rules" on public.grammar_rules;
drop policy "members read corpus" on public.corpus_entries;

create policy "read visible phonemes" on public.phonemes
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible phoneme classes" on public.phoneme_classes
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible class members" on public.phoneme_class_members
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible templates" on public.syllable_templates
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible slots" on public.syllable_slots
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible constraints" on public.phonotactic_constraints
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible word classes" on public.word_classes
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible categories" on public.grammatical_categories
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible category values" on public.category_values
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible class/category links" on public.word_class_categories
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible lexicon" on public.lexicon_entries
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible grammar rules" on public.grammar_rules
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible corpus" on public.corpus_entries
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

-- Deliberately NOT opened: project_members and profiles keep their member-only reads.
