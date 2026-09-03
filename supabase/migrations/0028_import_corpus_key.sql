-- The corpus import now matches on the English sentence, instead of only ever inserting.
--
-- 0022 and 0025 kept this format keyless on purpose: nothing in a two-column CSV could say
-- "this is the row you already have, changed," so an import only ever added, and a
-- corrected sentence arrived as a second row beside the original rather than replacing it.
-- That is being traded away here for the thing it cost: the English half of each row is
-- now the key, matched trimmed and exact, the same way `import_lexicon` matches on
-- `entry_key`. A file that corrects a conlang translation and is re-imported now updates
-- the stored row instead of duplicating it.
--
-- **What this costs, stated rather than hidden**: `corpus_entries` still carries no unique
-- constraint on English, and still should not — two examples can legitimately share an
-- English gloss, which is exactly what an alternate phrasing *is*. A file can only ever
-- name one row per English key, though, so a second stored row sharing a key with the
-- first is no longer reachable by an import at all: it falls out to "not carried by this
-- file," the same bucket a genuinely absent row lands in, and is left alone unless someone
-- opts into deleting it by hand in the review dialog. Nothing here deletes it on its own.
-- Where two rows share an English, `order by created_at` decides which one the key resolves
-- to, so a re-import is at least deterministic about which row it means.
--
-- A row whose English is blank cannot be a key — a translation waiting for a sentence is a
-- real working state — so it is always inserted, same as a lexicon row with no `entry_key`.
--
-- The signature grows a `p_delete_ids`, on the same footing `import_lexicon` was given one
-- in 0027: the review dialog can now propose a deletion, one row at a time, each of which
-- the user was shown and ticked. Nothing is ever inferred from absence.
drop function if exists public.import_corpus(uuid, jsonb);

create function public.import_corpus(
  p_project_id uuid,
  p_rows       jsonb,
  p_delete_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_row       jsonb;
  v_english   text;
  v_conlang   text;
  v_kind      public.corpus_kind;
  v_id        uuid;
  v_next      int;
  v_created   int := 0;
  v_updated   int := 0;
  v_deleted   int := 0;
  v_passages  int := 0;
begin
  -- Deliberately NOT security definer: RLS is the boundary and 0022's policies already
  -- say who may write. This guard only turns a silent no-op into a clear error.
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_next
    from public.corpus_entries where project_id = p_project_id;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_english := btrim(coalesce(v_row ->> 'english', ''));
    v_conlang := btrim(coalesce(v_row ->> 'conlang', ''));

    if v_english = '' and v_conlang = '' then
      continue;
    end if;

    -- A blank English cannot be a key, so it is never looked up — only ever inserted,
    -- same as a lexicon row with no entry_key.
    v_id := null;
    if v_english <> '' then
      select id into v_id
        from public.corpus_entries
       where project_id = p_project_id and btrim(english) = v_english
       order by created_at
       limit 1;
    end if;

    if v_id is not null then
      -- Only conlang is written. English is the key that got us here, so a file cannot
      -- change it out from under itself, and kind is left exactly as it was — a row an
      -- import updates keeps whichever sub-view a person filed it in.
      update public.corpus_entries set conlang = v_conlang where id = v_id;
      v_updated := v_updated + 1;
    else
      v_kind := case
        when v_english like E'%\n%' or v_conlang like E'%\n%' then 'passage'
        when length(v_english) > 240 or length(v_conlang) > 240 then 'passage'
        else 'utterance'
      end;

      insert into public.corpus_entries (project_id, english, conlang, sort_order, kind)
      values (p_project_id, v_english, v_conlang, v_next, v_kind);

      v_next    := v_next + 1;
      v_created := v_created + 1;
      if v_kind = 'passage' then
        v_passages := v_passages + 1;
      end if;
    end if;
  end loop;

  -- Last, and inside the same implicit transaction as the writes above: an import that
  -- fails part way through deletes nothing, the same guarantee `import_lexicon` gives.
  --
  -- `project_id` is in the predicate deliberately. RLS would refuse an id belonging to
  -- another project anyway, but a delete is worth scoping where it can be read.
  delete from public.corpus_entries
   where project_id = p_project_id
     and id = any(coalesce(p_delete_ids, '{}'::uuid[]));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'created', v_created, 'updated', v_updated, 'deleted', v_deleted, 'passages', v_passages
  );
end;
$$;

revoke execute on function public.import_corpus(uuid, jsonb, uuid[]) from public, anon;
grant  execute on function public.import_corpus(uuid, jsonb, uuid[]) to authenticated;
