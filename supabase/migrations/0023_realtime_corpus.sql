-- Same caveats as 0003. Like the lexicon and unlike the explicit-save sections, the corpus
-- *does* patch its list from these events: a collaborator adding an example should simply
-- appear. Only a row whose cell is dirty in this client is held still.
alter publication supabase_realtime add table public.corpus_entries;

-- Under RLS the `old` record is only the primary key, and DELETE events are neither
-- filtered by the subscription nor RLS-checked.
alter table public.corpus_entries replica identity full;
