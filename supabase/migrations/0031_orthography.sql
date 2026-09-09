-- Linguistic core, part 5: orthography.
--
-- Two things a written form needs, and nothing else this round: which character(s)
-- represent each phoneme, and free-form spelling rules for anything context-sensitive
-- (digraph resolution, capitalization, punctuation). Upstream has no romanization at all
-- — see 0008's comment — so unlike every earlier section there is no source document to
-- derive a schema from. This one is invented in the app.
--
-- `orthography_graphemes.phoneme_ipa` is text, not a foreign key to `phonemes`, for the
-- same reason phonotactics' class and slot membership are text (0012/0013): deleting a
-- phoneme from the inventory is an explicit act elsewhere, and it must not silently erase
-- a curated spelling choice. A dangling mapping is flagged as an orphan instead — see
-- `orphanedGraphemes` in `src/lib/orthography.ts`.
--
-- `orthography_rules` is field-for-field identical to `grammar_rules`: free text apart
-- from `name` and `rule_order`. Real orthographies have real structure (digraphs feeding
-- allophone rules feeding capitalization), but designing that is its own problem, the same
-- one grammar rules deferred for the phonological pipeline.
--
-- Both tables are created after 0026, so their SELECT policy goes straight to
-- `private.is_project_visible` rather than being retrofitted later — the same shape
-- `project_morphology` (0029) used. Unlike morphology, orthography is ordinary
-- member-editable linguistic content, not owner-only configuration.

create table public.orthography_graphemes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  phoneme_ipa text not null check (length(trim(phoneme_ipa)) > 0),
  grapheme    text not null check (length(trim(grapheme)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, phoneme_ipa)
);

create index orthography_graphemes_project_id_idx on public.orthography_graphemes (project_id);

create table public.orthography_rules (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  rule_order  int not null default 0,
  effect      text,
  environment text,
  examples    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, name)
);

create index orthography_rules_project_id_idx on public.orthography_rules (project_id, rule_order);

create trigger orthography_graphemes_touch_updated_at
  before update on public.orthography_graphemes
  for each row execute function public.touch_updated_at();

create trigger orthography_rules_touch_updated_at
  before update on public.orthography_rules
  for each row execute function public.touch_updated_at();

-- Activity stamping, as every table since 0018. Security definer lives on the trigger
-- function itself, not here: `projects` has an owner-only UPDATE policy, so a
-- collaborator's write could not otherwise stamp it.
create trigger orthography_graphemes_touch_activity
  after insert or update or delete on public.orthography_graphemes
  for each row execute function public.touch_project_activity();

create trigger orthography_rules_touch_activity
  after insert or update or delete on public.orthography_rules
  for each row execute function public.touch_project_activity();

alter table public.orthography_graphemes enable row level security;
alter table public.orthography_rules enable row level security;

-- Read: anyone who can see the project (member, or the project is public) — 0026's shape,
-- applied from the start rather than retrofitted.
create policy "read visible graphemes" on public.orthography_graphemes
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

create policy "read visible orthography rules" on public.orthography_rules
  for select to anon, authenticated
  using (private.is_project_visible(project_id));

-- Write: any project member. Content, not configuration — unlike project_morphology.
create policy "members insert graphemes" on public.orthography_graphemes
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update graphemes" on public.orthography_graphemes
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete graphemes" on public.orthography_graphemes
  for delete to authenticated
  using (private.is_project_member(project_id));

create policy "members insert orthography rules" on public.orthography_rules
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update orthography rules" on public.orthography_rules
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete orthography rules" on public.orthography_rules
  for delete to authenticated
  using (private.is_project_member(project_id));

-- Whole-page save across both tables in one call, mirroring `save_phonotactics` (multiple
-- tables) and `save_grammar_rules` (upsert-on-name, rule_order rewritten from position,
-- delete what the payload no longer names). Not security definer: RLS is the boundary,
-- and the guard below only turns a silent no-op into a readable error.
create or replace function public.save_orthography(
  p_project_id uuid,
  p_graphemes  jsonb,
  p_rules      jsonb
)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_grapheme jsonb;
  v_rule     jsonb;
  v_index    int := 0;
begin
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  -- Graphemes: upsert on the natural key, then drop what the payload no longer names.
  for v_grapheme in select * from jsonb_array_elements(coalesce(p_graphemes, '[]'::jsonb))
  loop
    insert into public.orthography_graphemes (project_id, phoneme_ipa, grapheme)
    values (p_project_id, v_grapheme ->> 'phoneme_ipa', v_grapheme ->> 'grapheme')
    on conflict (project_id, phoneme_ipa) do update
      set grapheme = excluded.grapheme;
  end loop;

  delete from public.orthography_graphemes
   where project_id = p_project_id
     and phoneme_ipa not in (
       select value ->> 'phoneme_ipa' from jsonb_array_elements(coalesce(p_graphemes, '[]'::jsonb))
     );

  -- Rules: same loop as save_grammar_rules — order is meaning, so it is rewritten from
  -- array position on every save, not read back from the payload.
  for v_rule in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    insert into public.orthography_rules
      (project_id, name, rule_order, effect, environment, examples, notes)
    values (
      p_project_id,
      v_rule ->> 'name',
      v_index,
      nullif(v_rule ->> 'effect', ''),
      nullif(v_rule ->> 'environment', ''),
      nullif(v_rule ->> 'examples', ''),
      nullif(v_rule ->> 'notes', '')
    )
    on conflict (project_id, name) do update
      set rule_order  = excluded.rule_order,
          effect      = excluded.effect,
          environment = excluded.environment,
          examples    = excluded.examples,
          notes       = excluded.notes;

    v_index := v_index + 1;
  end loop;

  delete from public.orthography_rules
   where project_id = p_project_id
     and name not in (
       select value ->> 'name' from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
     );
end;
$$;

revoke execute on function public.save_orthography(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.save_orthography(uuid, jsonb, jsonb) to authenticated;
