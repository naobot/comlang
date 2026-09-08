-- Per-project morphology plugin.
--
-- The corpus word-hover recognises inflected surface forms (`bukbi` -> `buk` + locative).
-- Which affixes exist, which slot each fills, the order the slots come in, and the
-- phonological rules were hard-coded for one conlang (`src/lib/morphologyRules.ts`). This
-- moves that description into a per-project document the owner authors, so every conlang
-- can have its own — and a project with no document still gets exact-lexicon-match hover.
--
-- One jsonb column rather than the normalised tables the rest of the linguistic core uses
-- (phonotactics, word classes). Deliberate: this is a single document, saved whole, never
-- queried piece by piece, whose shape the author largely defines and which will evolve.
-- `parseSpec` in `src/lib/morphologySpec.ts` is the shape guarantee a CHECK constraint
-- would otherwise give.
--
-- Editing is OWNER-ONLY — unlike the member-editable linguistic sections. It reads as
-- project configuration (it names word classes and entry-key conventions, it is a
-- power-user surface), so it sits with the owner's settings. Reading is
-- visible-to-everyone (0026 pattern) so a collaborator's corpus hover and a published
-- conlang's public corpus both still get the recogniser.

create table public.project_morphology (
  project_id uuid primary key references public.projects (id) on delete cascade,
  spec       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger project_morphology_touch_updated_at
  before update on public.project_morphology
  for each row execute function public.touch_updated_at();

-- Activity stamping, as every other content table does since 0018. Security definer there,
-- and required: `projects` has an owner-only UPDATE policy, so the write could not
-- otherwise stamp the project.
create trigger project_morphology_touch_activity
  after insert or update or delete on public.project_morphology
  for each row execute function public.touch_project_activity();

alter table public.project_morphology enable row level security;

-- Read: anyone who can see the project (member, or the project is public). Same shape 0026
-- gave every core table, so a published conlang's corpus hover works for anon.
create policy "read visible morphology" on public.project_morphology
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

-- Write: the owner only. The one linguistic-adjacent table that is not member-editable.
create policy "owner inserts morphology" on public.project_morphology
  for insert to authenticated
  with check (private.is_project_owner(project_id));

create policy "owner updates morphology" on public.project_morphology
  for update to authenticated
  using (private.is_project_owner(project_id))
  with check (private.is_project_owner(project_id));

create policy "owner deletes morphology" on public.project_morphology
  for delete to authenticated
  using (private.is_project_owner(project_id));

-- Save is a single upsert, but an RPC like every other section's save: one clear error
-- path, and a home for server-side validation later. Not security definer — RLS is the
-- boundary, and the guard below just turns a silent no-op into a readable error.
create or replace function public.save_morphology(p_project_id uuid, p_spec jsonb)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not private.is_project_owner(p_project_id) then
    raise exception 'only the project owner can edit the morphology plugin'
      using errcode = '42501';
  end if;

  insert into public.project_morphology (project_id, spec)
  values (p_project_id, p_spec)
  on conflict (project_id) do update set spec = excluded.spec;
end;
$$;

revoke execute on function public.save_morphology(uuid, jsonb) from public, anon;
grant  execute on function public.save_morphology(uuid, jsonb) to authenticated;
