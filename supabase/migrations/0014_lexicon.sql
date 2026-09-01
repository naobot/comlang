-- Linguistic core, part 3: the lexicon.
--
-- Fields are deliberately loose this round. `word_class` is text rather than a foreign
-- key because the table it would point at does not exist: the word-classes design was
-- tabled after it turned up five places the source resists a slot model. Inventing that
-- schema here to satisfy a foreign key would prejudge it. This is meant to tighten later
-- — do not "fix" it in passing.

create table public.lexicon_entries (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  lemma      text not null check (length(trim(lemma)) > 0),
  gloss      text,
  word_class text,
  notes      text,
  -- The co-designer's stable CSV key. grammar.yaml keeps it so an upstream lexicon edit
  -- can be diffed against this file; the same reasoning applies here.
  entry_key  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No unique constraint on lemma, deliberately: the language has homographs — `exceptions`
-- in grammar.yaml carries "homograph" as a sentinel reason — so requiring distinct lemmas
-- would reject real words. Uniqueness belongs on the key, and only where one is set.
create unique index lexicon_entries_key_idx
  on public.lexicon_entries (project_id, entry_key)
  where entry_key is not null;

create index lexicon_entries_project_id_idx on public.lexicon_entries (project_id);

create trigger lexicon_entries_touch_updated_at
  before update on public.lexicon_entries
  for each row execute function public.touch_updated_at();

alter table public.lexicon_entries enable row level security;

-- Policies follow 0004. All four verbs to any member; the language is what a
-- collaborator is here to edit.
--
-- No save RPC for this table. Editing is per entry, so it is plain REST insert/update/
-- delete and RLS is the entire boundary — the RPCs on the phoneme and phonotactics pages
-- exist only because those saves span several tables in one transaction.
create policy "members read lexicon" on public.lexicon_entries
  for select to authenticated
  using (private.is_project_member(project_id));

create policy "members insert lexicon" on public.lexicon_entries
  for insert to authenticated
  with check (private.is_project_member(project_id));

create policy "members update lexicon" on public.lexicon_entries
  for update to authenticated
  using (private.is_project_member(project_id))
  with check (private.is_project_member(project_id));

create policy "members delete lexicon" on public.lexicon_entries
  for delete to authenticated
  using (private.is_project_member(project_id));
