-- Realtime for the morphology plugin. As in 0009/0011/0015/0017/0020/0023: `replica
-- identity full` so an UPDATE carries the whole row, with the standing caveat that under
-- RLS a DELETE still delivers only the primary key, on a stream neither filtered by
-- project nor RLS-checked. See useProjectChannel.onDelete.
alter table public.project_morphology replica identity full;

alter publication supabase_realtime add table public.project_morphology;
