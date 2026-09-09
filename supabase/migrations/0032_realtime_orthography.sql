-- Same caveats as 0011/0017: whole-page explicit save, so both stores notify rather than
-- patch on an incoming event.
alter publication supabase_realtime add table public.orthography_graphemes;
alter publication supabase_realtime add table public.orthography_rules;

alter table public.orthography_graphemes replica identity full;
alter table public.orthography_rules replica identity full;
