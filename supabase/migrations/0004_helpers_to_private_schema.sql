-- The membership helpers only ever need to be callable from inside a policy, but
-- sitting in `public` they were also published as /rest/v1/rpc/is_project_member (the
-- Supabase security advisor flags this). Moving them to a schema PostgREST does not
-- expose keeps the policies working and takes them off the API surface.
--
-- create_project stays in public: it is called over RPC by design, and the advisor
-- warning it raises is expected.
--
-- Future project-scoped tables should reference private.is_project_member /
-- private.is_project_owner, never a direct subquery on project_members.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke execute on function private.is_project_member(uuid) from public, anon;
revoke execute on function private.is_project_owner(uuid)  from public, anon;
grant  execute on function private.is_project_member(uuid) to authenticated;
grant  execute on function private.is_project_owner(uuid)  to authenticated;

drop policy "members read projects"  on public.projects;
drop policy "owners update projects" on public.projects;
drop policy "owners delete projects" on public.projects;

create policy "members read projects" on public.projects
  for select to authenticated
  using (private.is_project_member(id));

create policy "owners update projects" on public.projects
  for update to authenticated
  using (private.is_project_owner(id))
  with check (private.is_project_owner(id));

create policy "owners delete projects" on public.projects
  for delete to authenticated
  using (private.is_project_owner(id));

drop policy "members read membership"                  on public.project_members;
drop policy "owners add members"                       on public.project_members;
drop policy "owners update members"                    on public.project_members;
drop policy "owners remove members, members may leave" on public.project_members;

create policy "members read membership" on public.project_members
  for select to authenticated
  using (private.is_project_member(project_id));

create policy "owners add members" on public.project_members
  for insert to authenticated
  with check (private.is_project_owner(project_id));

create policy "owners update members" on public.project_members
  for update to authenticated
  using (private.is_project_owner(project_id))
  with check (private.is_project_owner(project_id));

create policy "owners remove members, members may leave" on public.project_members
  for delete to authenticated
  using (private.is_project_owner(project_id) or user_id = (select auth.uid()));

drop function if exists public.is_project_member(uuid);
drop function if exists public.is_project_owner(uuid);
