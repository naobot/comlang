-- Linguistic core, part 1: the project's phoneme inventory.
--
-- A row here means "this project's language uses this segment". Nothing more: no
-- romanization (orthography is its own layer, and upstream has none — see
-- conlang/docs/overview.md:162), and no distinctive features. The IPA chart the UI
-- toggles against is static reference data in src/data/ipa.ts, identical for every
-- project, so it is deliberately not a table.

create type phoneme_kind as enum ('consonant', 'vowel');

create table public.phonemes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  ipa        text not null check (length(trim(ipa)) > 0),
  -- Denormalized rather than looked up in the chart: downstream SQL can then ask for
  -- "the vowels" without the reference module, and a later revision of that module
  -- cannot retroactively change what an existing row meant.
  kind       phoneme_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ipa)
);

create index phonemes_project_id_idx on public.phonemes (project_id);

create trigger phonemes_touch_updated_at
  before update on public.phonemes
  for each row execute function public.touch_updated_at();

alter table public.phonemes enable row level security;

-- Policies follow 0004: every membership test goes through private.is_project_member,
-- never a direct subquery on project_members.
--
-- All four verbs are open to any member, not just owners. Owner-only is the rule for
-- project settings and membership; the language itself is what the collaborator is here
-- to edit.

create policy "members read phonemes" on public.phonemes
  for select to authenticated
  using (private.is_project_member(project_id));

create policy "members insert phonemes" on public.phonemes
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update phonemes" on public.phonemes
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete phonemes" on public.phonemes
  for delete to authenticated
  using (private.is_project_member(project_id));

-- The inventory page saves explicitly, submitting the complete desired set rather than
-- a stream of individual edits. So the write is a set-replace, and it has to be atomic:
-- a half-applied inventory is worse than a rejected one.
create or replace function public.save_phoneme_inventory(p_project_id uuid, p_phonemes jsonb)
returns setof public.phonemes
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- Deliberately NOT security definer: RLS is the boundary here, and the policies above
  -- already say who may write. This guard exists only so that a non-member gets a clear
  -- error instead of a silently empty result set.
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  -- An empty array clears the inventory: `not in (empty set)` is true for every row.
  delete from public.phonemes
   where project_id = p_project_id
     and ipa not in (select value ->> 'ipa' from jsonb_array_elements(p_phonemes));

  -- do nothing, not do update: a phoneme that is already selected must keep its id, or
  -- every save would churn the ids that later tables will reference.
  insert into public.phonemes (project_id, ipa, kind)
  select p_project_id, value ->> 'ipa', (value ->> 'kind')::phoneme_kind
    from jsonb_array_elements(p_phonemes)
  on conflict (project_id, ipa) do nothing;

  return query select * from public.phonemes where project_id = p_project_id;
end;
$$;

revoke execute on function public.save_phoneme_inventory(uuid, jsonb) from public, anon;
grant  execute on function public.save_phoneme_inventory(uuid, jsonb) to authenticated;
