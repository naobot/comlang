-- projects.created_by references auth.users with no covering index, so removing a user
-- forces a sequential scan of projects to check the constraint.
create index projects_created_by_idx on public.projects (created_by);
