-- Same caveats as 0003. The inventory page uses these events only to raise a "changed
-- by someone else" banner — it never patches the in-progress draft, because the page
-- saves explicitly and a live patch would rewrite an edit the user is in the middle of.
alter publication supabase_realtime add table public.phonemes;

-- Gives UPDATE and DELETE an `old` record. Under RLS that `old` is only the primary
-- key, and DELETE events are neither filtered by the subscription nor RLS-checked, so
-- the client must treat a delete as a bare id off an unfiltered stream.
alter table public.phonemes replica identity full;
