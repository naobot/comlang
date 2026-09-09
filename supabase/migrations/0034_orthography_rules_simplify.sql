-- Orthography rules, simplified: `effect` and `environment` become one field, and `notes`
-- is dropped outright.
--
-- 0031 copied `grammar_rules`' shape wholesale (name, rule_order, effect, environment,
-- examples, notes), on the theory that orthography rules might need the same split
-- grammar rules do. In practice every orthography rule written so far already states its
-- environment as part of one prose sentence ("as the onset of a word's first syllable",
-- "immediately after a consonant") — the separate column never carried information the
-- effect text didn't already have, it just meant two boxes to fill in for one idea. Merge
-- what's there into `effect` (folding the environment in verbatim where a row had one and
-- `effect` didn't already say it) and drop the column. `notes` goes because nothing in
-- this table has ever used it for anything a rewritten `effect` couldn't say instead.

update public.orthography_rules
set effect = trim(both E'\n' from
  coalesce(effect, '') ||
  case
    when environment is not null and length(trim(environment)) > 0
      and position(lower(trim(environment)) in lower(coalesce(effect, ''))) = 0
    then (case when length(trim(coalesce(effect, ''))) > 0 then E'\n\n' else '' end)
      || 'Environment: ' || trim(environment)
    else ''
  end
);

alter table public.orthography_rules drop column environment;
alter table public.orthography_rules drop column notes;

-- save_orthography, with the two dropped columns gone from its payload and its upsert.
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
    insert into public.orthography_rules (project_id, name, rule_order, effect, examples)
    values (
      p_project_id,
      v_rule ->> 'name',
      v_index,
      nullif(v_rule ->> 'effect', ''),
      nullif(v_rule ->> 'examples', '')
    )
    on conflict (project_id, name) do update
      set rule_order = excluded.rule_order,
          effect     = excluded.effect,
          examples   = excluded.examples;

    v_index := v_index + 1;
  end loop;

  delete from public.orthography_rules
   where project_id = p_project_id
     and name not in (
       select value ->> 'name' from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
     );
end;
$$;
