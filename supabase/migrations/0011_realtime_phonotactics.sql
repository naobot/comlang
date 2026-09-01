-- Same caveats as 0003 and 0009. The phonotactics page uses these events only to raise a
-- "changed by someone else" banner; it never patches the in-progress draft, because the
-- page saves explicitly.
--
-- Unlike the phoneme page, the store here detects its own echoes by re-fetching and
-- comparing rather than by tracking ids: one save writes across all five of these tables
-- at once, and id bookkeeping across that many events would be fragile.
alter publication supabase_realtime add table public.phoneme_classes;
alter publication supabase_realtime add table public.phoneme_class_members;
alter publication supabase_realtime add table public.syllable_templates;
alter publication supabase_realtime add table public.syllable_slots;
alter publication supabase_realtime add table public.phonotactic_constraints;

-- Gives UPDATE and DELETE an `old` record. Under RLS that `old` is only the primary key,
-- and DELETE events are neither filtered by the subscription nor RLS-checked.
alter table public.phoneme_classes         replica identity full;
alter table public.phoneme_class_members   replica identity full;
alter table public.syllable_templates      replica identity full;
alter table public.syllable_slots          replica identity full;
alter table public.phonotactic_constraints replica identity full;
