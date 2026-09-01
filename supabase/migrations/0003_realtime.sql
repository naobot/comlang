-- Realtime via Postgres Changes.
--
-- Two caveats that shape the client code in src/composables/useProjectChannel.ts:
--
--   1. DELETE events are NOT filterable. A subscription filtered to
--      project_id=eq.<id> still receives deletes for rows in every other project.
--   2. RLS is not applied to DELETE events, and with RLS on plus replica identity
--      full, the `old` record carries only the primary key.
--
-- So a delete handler receives a bare id off an unfiltered stream. It must be written
-- as "drop this id if I hold it" and must never assume the event is relevant.

alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.project_members;

-- Without this, UPDATE and DELETE carry no `old` record at all.
alter table public.projects        replica identity full;
alter table public.project_members replica identity full;
