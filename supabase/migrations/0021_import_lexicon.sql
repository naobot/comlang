-- Bulk import for the lexicon.
--
-- The lexicon is otherwise the one section that saves per entry, and deliberately so — the
-- unit of editing is the record in front of you. An import is the exception: it is one act
-- over many rows, and a half-applied file is a worse state than a refused one. So it gets
-- an RPC like the whole-page sections do, and for the same reason.
--
-- **Matching is on `entry_key` only.** Never on lemma: the language has homographs — `gwan`
-- is both "meaning" (noun) and "become" (verb) — which is why `lexicon_entries` has no
-- unique constraint on lemma (0014). Matching on it would merge two different words. A row
-- with no key is therefore always an insert.
--
-- **`p_fields` is which columns the file actually carried**, and the only ones an update
-- may write. The two-column export has no gloss column at all, and treating an absent
-- column as "clear it" would silently empty every gloss in the project on import. Columns
-- outside `p_fields` keep the value already stored.
--
-- Nothing is ever deleted. An import is additive: a partial file is a normal thing to
-- import, and inferring deletions from absence would make it a whole-project replace.
create or replace function public.import_lexicon(
  p_project_id uuid,
  p_rows       jsonb,
  p_fields     text[]
)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_row      jsonb;
  v_id       uuid;
  v_key      text;
  v_created  int := 0;
  v_updated  int := 0;
begin
  -- Deliberately NOT security definer: RLS is the boundary and the lexicon policies
  -- already say who may write. This guard only turns a silent no-op into a clear error.
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_key := nullif(v_row ->> 'entry_key', '');
    v_id  := null;

    if v_key is not null then
      select id into v_id
        from public.lexicon_entries
       where project_id = p_project_id and entry_key = v_key;
    end if;

    if v_id is null then
      insert into public.lexicon_entries (project_id, entry_key, lemma, gloss, word_class, notes)
      values (
        p_project_id,
        v_key,
        v_row ->> 'lemma',
        nullif(v_row ->> 'gloss', ''),
        nullif(v_row ->> 'word_class', ''),
        nullif(v_row ->> 'notes', '')
      );
      v_created := v_created + 1;
    else
      update public.lexicon_entries
         set lemma      = case when 'lemma'      = any(p_fields)
                               then v_row ->> 'lemma' else lemma end,
             gloss      = case when 'gloss'      = any(p_fields)
                               then nullif(v_row ->> 'gloss', '') else gloss end,
             word_class = case when 'word_class' = any(p_fields)
                               then nullif(v_row ->> 'word_class', '') else word_class end,
             notes      = case when 'notes'      = any(p_fields)
                               then nullif(v_row ->> 'notes', '') else notes end
       where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

revoke execute on function public.import_lexicon(uuid, jsonb, text[]) from public, anon;
grant  execute on function public.import_lexicon(uuid, jsonb, text[]) to authenticated;
