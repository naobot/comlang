-- Adds `summary` to orthography rules: one sentence stating the rule as a rule, beside
-- the `effect` prose that explains it.
--
-- 0034 merged `environment` into `effect` on the grounds that every rule stated its
-- environment inside one prose sentence anyway, and that a second box for the same idea
-- was structure without content. That still holds — and this is not that column back.
-- `effect` is written for a person reading the language's documentation: it teaches,
-- hedges, points at neighbouring rules ("see the intervocalic /ŋ/ rule"). What it does
-- not do is state the rule in a form something else can be checked against, which is what
-- the downstream consumers of the export want. `xenic`'s intervocalic-/ŋ/ rule is the
-- worked example: its `effect` runs to six lines about syllable boundaries and coda
-- blocking, and the thing a scorer or a reader actually needs from it is
--
--   <ng> is spelled <ngg> between two vowels, or after a vowel and before a glide.
--
-- So: nullable text, blank-is-null, prose-shaped, same convention as `effect` and
-- `examples`. Deliberately NOT a structured rewrite-rule type. A formal notation would
-- have to cover every rule any project might write, and the one thing 0031 and 0034
-- between them established is that this table's contents are not yet regular enough to
-- justify a schema for them. One disciplined sentence is a real improvement over six
-- discursive ones and costs nothing if a project leaves it blank.

alter table public.orthography_rules add column summary text;

-- save_orthography, carrying the new column. Same shape as 0034's — the rules loop
-- rewrites `rule_order` from array position on every save, because order is meaning.
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
    insert into public.orthography_rules (project_id, name, rule_order, summary, effect, examples)
    values (
      p_project_id,
      v_rule ->> 'name',
      v_index,
      nullif(v_rule ->> 'summary', ''),
      nullif(v_rule ->> 'effect', ''),
      nullif(v_rule ->> 'examples', '')
    )
    on conflict (project_id, name) do update
      set rule_order = excluded.rule_order,
          summary    = excluded.summary,
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
