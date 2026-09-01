-- Linguistic core, part 4: grammar rules.
--
-- Free-form text this round. The source's rules carry a lot of structure — SPE-style
-- formal sources, per-rule provenance split across `inferred` / `confirmed_by` /
-- `fitted_to` / `attested` / `contradicted_by` — and none of it is being modelled yet.
-- The field names below match grammar.yaml's own so that tightening later is a rename
-- rather than a re-parse.
--
-- The one structural thing that IS kept is **order**. `rule_order` in grammar.yaml is a
-- feeding pipeline, not a display preference: plural_reduplication feeds
-- onset_simplification, vowel_harmony feeds u_lowering. Order is cheap to store now and
-- unrecoverable if thrown away, so it is a real column rather than a later migration.

create table public.grammar_rules (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- The natural key. grammar.yaml's rule_order is a list of these names, and
  -- derivation_worked_example keys off them too.
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

create index grammar_rules_project_id_idx on public.grammar_rules (project_id, rule_order);

create trigger grammar_rules_touch_updated_at
  before update on public.grammar_rules
  for each row execute function public.touch_updated_at();

alter table public.grammar_rules enable row level security;

create policy "members read grammar_rules" on public.grammar_rules
  for select to authenticated
  using (private.is_project_member(project_id));

create policy "members insert grammar_rules" on public.grammar_rules
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update grammar_rules" on public.grammar_rules
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete grammar_rules" on public.grammar_rules
  for delete to authenticated
  using (private.is_project_member(project_id));

-- Whole-page save, like phonotactics rather than like the lexicon: reordering is
-- inherently multi-row, so a per-rule save could leave the pipeline half-permuted.
--
-- Upserts on the natural key so ids survive a save. Nothing references a rule id yet,
-- but derivation_worked_example already references rule *names*, and the day something
-- points at a rule this is the difference between a stable reference and a churned one.
create or replace function public.save_grammar_rules(p_project_id uuid, p_rules jsonb)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_rule jsonb;
  v_index int := 0;
begin
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  for v_rule in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    insert into public.grammar_rules (project_id, name, rule_order, effect, environment, examples, notes)
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

  -- An empty array clears them all: `not in (empty set)` is true for every row.
  delete from public.grammar_rules
   where project_id = p_project_id
     and name not in (
       select value ->> 'name' from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
     );
end;
$$;

revoke execute on function public.save_grammar_rules(uuid, jsonb) from public, anon;
grant  execute on function public.save_grammar_rules(uuid, jsonb) to authenticated;
