-- Same caveats as 0003. Whole-page explicit save, so this notifies rather than patches.
alter publication supabase_realtime add table public.grammar_rules;
alter table public.grammar_rules replica identity full;
