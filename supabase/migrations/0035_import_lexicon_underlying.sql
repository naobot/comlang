-- `underlying_phonology` (0033) has to survive a CSV round trip. `toLexiconCsvFull` now
-- writes it as a column and `parseLexiconCsv` reads it, so `import_lexicon` has to write
-- it too — on insert always, and on update only when the file carried the column, exactly
-- as `p_fields` already gates `gloss`, `word_class` and `notes`.
--
-- The signature is unchanged from 0027 (uuid, jsonb, text[], uuid[]), so this is a
-- `create or replace` rather than a drop-and-create — there is no ambiguity for PostgREST
-- to trip over.
--
-- Not here: the "fill meaning and word class from the entry key" step. That is done on the
-- client while the import is being reviewed (see `deriveFromKey` in `lexiconImport.ts`),
-- so the derived values are shown before anything is written and simply arrive in `p_rows`
-- like any other cell. The insert below already writes whatever the row carries.

create or replace function public.import_lexicon(
  p_project_id uuid,
  p_rows       jsonb,
  p_fields     text[],
  p_delete_ids uuid[] default '{}'::uuid[]
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
  v_deleted  int := 0;
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
      insert into public.lexicon_entries
        (project_id, entry_key, lemma, underlying_phonology, gloss, word_class, notes)
      values (
        p_project_id,
        v_key,
        v_row ->> 'lemma',
        nullif(v_row ->> 'underlying_phonology', ''),
        nullif(v_row ->> 'gloss', ''),
        nullif(v_row ->> 'word_class', ''),
        nullif(v_row ->> 'notes', '')
      );
      v_created := v_created + 1;
    else
      update public.lexicon_entries
         set lemma                = case when 'lemma' = any(p_fields)
                                         then v_row ->> 'lemma' else lemma end,
             underlying_phonology = case when 'underlying_phonology' = any(p_fields)
                                         then nullif(v_row ->> 'underlying_phonology', '')
                                         else underlying_phonology end,
             gloss                = case when 'gloss' = any(p_fields)
                                         then nullif(v_row ->> 'gloss', '') else gloss end,
             word_class           = case when 'word_class' = any(p_fields)
                                         then nullif(v_row ->> 'word_class', '') else word_class end,
             notes                = case when 'notes' = any(p_fields)
                                         then nullif(v_row ->> 'notes', '') else notes end
       where id = v_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- Last, and inside the same implicit transaction as the writes above: an import that
  -- fails half way through deletes nothing, which is the same guarantee the function was
  -- given an RPC for in the first place.
  --
  -- `project_id` is in the predicate deliberately. RLS would refuse an id belonging to
  -- another project anyway, but a delete is worth scoping where it can be read.
  delete from public.lexicon_entries
   where project_id = p_project_id
     and id = any(coalesce(p_delete_ids, '{}'::uuid[]));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'deleted', v_deleted);
end;
$$;

revoke execute on function public.import_lexicon(uuid, jsonb, text[], uuid[]) from public, anon;
grant  execute on function public.import_lexicon(uuid, jsonb, text[], uuid[]) to authenticated;
