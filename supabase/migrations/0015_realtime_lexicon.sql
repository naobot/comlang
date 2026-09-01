-- Same caveats as 0003. Unlike the other sections the lexicon *does* patch its list from
-- these events — a collaborator adding a word should just appear. The entry currently
-- open for editing is the only thing held still, and only while it is dirty.
alter publication supabase_realtime add table public.lexicon_entries;

-- Under RLS the `old` record is only the primary key, and DELETE events are neither
-- filtered by the subscription nor RLS-checked.
alter table public.lexicon_entries replica identity full;
