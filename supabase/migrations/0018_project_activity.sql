-- "Last updated by X at Y" in the header needs something to read, and nothing recorded
-- who touched what. Two columns on `projects`, kept current by triggers on every table
-- that hangs off it.
--
-- `on delete set null` rather than restrict: we already hit the restrict version of this
-- on `created_by`, where deleting a test account meant hand-deleting their projects
-- first. Losing the attribution is the right trade against blocking the delete.

alter table public.projects
  add column last_activity_at timestamptz not null default now(),
  add column last_activity_by uuid references auth.users (id) on delete set null;

-- Content tables. SECURITY DEFINER is required, not incidental: `projects` has an
-- owner-only UPDATE policy, so a collaborator editing the lexicon could not otherwise
-- stamp the project. Per 0007 the EXECUTE grant is revoked — a trigger function must not
-- also be an RPC endpoint. Triggers fire as the table owner, so this still works.
create or replace function public.touch_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_project uuid;
begin
  if tg_op = 'DELETE' then
    v_project := old.project_id;
  else
    v_project := new.project_id;
  end if;

  update public.projects
     set last_activity_at = now(),
         -- Keep whoever last touched it if there is no caller identity, rather than
         -- blanking the attribution.
         last_activity_by = coalesce((select auth.uid()), last_activity_by)
   where id = v_project;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Renaming a project is activity too. Done in a BEFORE trigger on the row itself so it
-- cannot recurse into the AFTER triggers above.
create or replace function public.touch_own_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.last_activity_at := now();
  if tg_op = 'INSERT' then
    new.last_activity_by := coalesce((select auth.uid()), new.created_by);
  else
    new.last_activity_by := coalesce((select auth.uid()), old.last_activity_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.touch_project_activity() from public, anon, authenticated;
revoke execute on function public.touch_own_project_activity() from public, anon, authenticated;

create trigger projects_touch_activity
  before insert or update on public.projects
  for each row execute function public.touch_own_project_activity();

create trigger phonemes_touch_activity
  after insert or update or delete on public.phonemes
  for each row execute function public.touch_project_activity();

create trigger phoneme_classes_touch_activity
  after insert or update or delete on public.phoneme_classes
  for each row execute function public.touch_project_activity();

create trigger phoneme_class_members_touch_activity
  after insert or update or delete on public.phoneme_class_members
  for each row execute function public.touch_project_activity();

create trigger syllable_templates_touch_activity
  after insert or update or delete on public.syllable_templates
  for each row execute function public.touch_project_activity();

create trigger syllable_slots_touch_activity
  after insert or update or delete on public.syllable_slots
  for each row execute function public.touch_project_activity();

create trigger phonotactic_constraints_touch_activity
  after insert or update or delete on public.phonotactic_constraints
  for each row execute function public.touch_project_activity();

create trigger lexicon_entries_touch_activity
  after insert or update or delete on public.lexicon_entries
  for each row execute function public.touch_project_activity();

create trigger grammar_rules_touch_activity
  after insert or update or delete on public.grammar_rules
  for each row execute function public.touch_project_activity();
