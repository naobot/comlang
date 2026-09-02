-- The corpus splits into two sub-views: passages and utterances.
--
-- Why a column and not a derived rule. The obvious alternative is to call anything with a
-- newline in it a passage and store nothing, which costs no schema and survives a CSV
-- round trip for free. It fails at the only moment that matters: a passage starts empty
-- and is typed into, so a derived rule would have the row you are writing hop out of the
-- view you are writing it in and land in the other one halfway through the first
-- sentence. The kind is a decision someone makes when they start writing, so it is stored.
--
-- **The CSV is unchanged and carries no kind.** It is still `english,conlang`, still one
-- file for the whole corpus, and still the thing `toCorpusCsv` writes — the sub-views are
-- how the corpus is edited, not a second format. What follows from that is stated plainly
-- rather than papered over: on import the kind is *inferred* from the shape of the text
-- (see below), so exporting a short passage and importing it again brings it back as an
-- utterance. That is the same family of loss as this format's missing key column, it is
-- one click to correct, and it is worth less than the cost of a third column that every
-- other tool reading these files would have to learn.

create type public.corpus_kind as enum ('utterance', 'passage');

alter table public.corpus_entries
  add column kind public.corpus_kind not null default 'utterance';

comment on column public.corpus_entries.kind is
  'Which sub-view this entry is edited in. Not carried by the CSV; inferred on import.';

-- The grid and the passage list each read one kind, so the sort they read in is the
-- index they want.
create index corpus_entries_kind_idx
  on public.corpus_entries (project_id, kind, sort_order);

-- Unchanged from 0022 apart from the kind: still insert-only, still deduping on the pair,
-- still returning counts. Repeated in full because `create or replace` cannot patch one
-- statement.
--
-- **The inference is a heuristic and is only ever applied to rows arriving from a file**,
-- where nothing can say what the row is. A newline is the reliable signal — a conversation
-- or a stanza has line breaks and an example sentence does not — and the length cut-off
-- catches the pasted paragraph, which is a passage with no newline in it. Neither is a
-- claim; both are a starting view that a person can change with one button.
--
-- `CORPUS_PASSAGE_MIN_LENGTH` in src/lib/corpusImport.ts is the same number, so the
-- confirmation dialog can state the split before the import runs. Two copies of one rule
-- is a real cost; the alternative is importing before you can say what will happen.
create or replace function public.import_corpus(p_project_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_row       jsonb;
  v_english   text;
  v_conlang   text;
  v_kind      public.corpus_kind;
  v_next      int;
  v_created   int := 0;
  v_skipped   int := 0;
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
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Already present verbatim, either in the project or earlier in this same file.
    -- Deliberately not narrowed by kind: the same text in the other view is the same
    -- example, and adding it twice because it is filed differently would be a doubling.
    if exists (
      select 1 from public.corpus_entries
       where project_id = p_project_id
         and btrim(english) = v_english
         and btrim(conlang) = v_conlang
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

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
  end loop;

  -- `passages` is additive: an older client reading only created/skipped is unaffected.
  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'passages', v_passages);
end;
$$;

revoke execute on function public.import_corpus(uuid, jsonb) from public, anon;
grant  execute on function public.import_corpus(uuid, jsonb) to authenticated;
