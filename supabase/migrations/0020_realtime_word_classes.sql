-- Realtime for the word-class section. As in 0009/0011/0015/0017: `replica identity full`
-- so an UPDATE carries the whole row, with the standing caveat that under RLS a DELETE
-- still delivers only the primary key, on a stream that is neither filtered by project
-- nor RLS-checked. See useProjectChannel.onDelete.
alter table public.word_classes           replica identity full;
alter table public.grammatical_categories replica identity full;
alter table public.category_values        replica identity full;
alter table public.word_class_categories  replica identity full;

alter publication supabase_realtime add table public.word_classes;
alter publication supabase_realtime add table public.grammatical_categories;
alter publication supabase_realtime add table public.category_values;
alter publication supabase_realtime add table public.word_class_categories;
