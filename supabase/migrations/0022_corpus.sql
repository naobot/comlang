-- Linguistic core, part 6: the corpus — example utterances, English beside conlang.
--
-- Deliberately two columns and nothing else. Every other section models structure; this
-- one is a notebook of things people have actually said in the language, and the value of
-- a notebook is that writing in it is free. A gloss line, a grammaticality flag and a
-- provenance link are all plausible later columns and all of them would be a reason to
-- hesitate before typing a sentence down, so none of them are here.
--
-- **Both sides are `not null default ''` rather than nullable**, which is the opposite of
-- the lexicon's convention. The editor is a grid: a cell is empty or it is not, and there
-- is no third state for "never filled in" to mean. The check constraint is what keeps a
-- wholly blank row out — one side alone is legitimate, though. A sentence waiting to be
-- translated and a translation waiting for a sentence are both normal working states, and
-- a table that refused them would just push that work somewhere else.

create table public.corpus_entries (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  english    text not null default '',
  conlang    text not null default '',
  -- Spreadsheet order. A column rather than sorting on created_at, because `now()` is
  -- transaction time: every row of an import would share one timestamp and read back in
  -- arbitrary order. Same trap the word-class seed hit.
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corpus_entries_not_blank
    check (length(trim(english)) > 0 or length(trim(conlang)) > 0)
);

-- No unique constraint on either column, and none on the pair either. Two examples can
-- legitimately share an English translation (that is what showing alternatives *is*), and
-- the same conlang sentence can be glossed two ways. Import dedupes on the pair as a
-- courtesy; the table does not enforce it, because enforcing it would reject real data.
create index corpus_entries_project_id_idx on public.corpus_entries (project_id, sort_order);

create trigger corpus_entries_touch_updated_at
  before update on public.corpus_entries
  for each row execute function public.touch_updated_at();

alter table public.corpus_entries enable row level security;

-- Policies follow 0004: all four verbs to any member. Content is member-editable.
--
-- No save RPC for ordinary editing — like the lexicon, the unit is the row in front of
-- you, so it is plain REST and RLS is the whole boundary. Import is the exception below.
create policy "members read corpus" on public.corpus_entries
  for select to authenticated
  using (private.is_project_member(project_id));

create policy "members insert corpus" on public.corpus_entries
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update corpus" on public.corpus_entries
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete corpus" on public.corpus_entries
  for delete to authenticated
  using (private.is_project_member(project_id));

-- Activity stamping, as 0018 does for every other content table.
create trigger corpus_entries_touch_activity
  after insert or update or delete on public.corpus_entries
  for each row execute function public.touch_project_activity();

-- Bulk import, for the same reason `import_lexicon` (0021) exists: an import is one act
-- over many rows, and a file half-applied is a worse state than one refused.
--
-- **It only ever inserts.** The CSV is two columns of prose with no key column, so there
-- is nothing in the file that can say "this is the row you already have, changed" — the
-- only candidate is the text itself, and the text is exactly what an edit changes. Given
-- that, matching on it would be guessing, and a wrong guess overwrites a sentence someone
-- wrote. So a row that is not already present verbatim is added, and a row that is
-- already present verbatim is skipped, which is what makes re-importing the same file a
-- no-op rather than a doubling. Fixing a typo upstream and re-importing therefore adds a
-- row rather than correcting one; that is inherent to a keyless format, and the UI says
-- the counts before anything is written.
--
-- Nothing is ever deleted or updated. Absence from a file is not a request.
create or replace function public.import_corpus(p_project_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_row     jsonb;
  v_english text;
  v_conlang text;
  v_next    int;
  v_created int := 0;
  v_skipped int := 0;
begin
  -- Deliberately NOT security definer: RLS is the boundary and the policies above already
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
    if exists (
      select 1 from public.corpus_entries
       where project_id = p_project_id
         and btrim(english) = v_english
         and btrim(conlang) = v_conlang
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.corpus_entries (project_id, english, conlang, sort_order)
    values (p_project_id, v_english, v_conlang, v_next);

    v_next    := v_next + 1;
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.import_corpus(uuid, jsonb) from public, anon;
grant  execute on function public.import_corpus(uuid, jsonb) to authenticated;
