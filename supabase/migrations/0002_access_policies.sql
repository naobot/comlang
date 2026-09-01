-- RLS for the access layer.
--
-- SUPERSEDED IN PART by 0004, which moves the two helpers into the `private` schema so
-- PostgREST stops publishing them as RPC endpoints. Copy the pattern from 0004, not
-- from here. Kept as written because migrations are a history, not a current picture.
--
-- The helpers below exist to break policy recursion: a policy on projects that reads
-- project_members, while project_members' own policy also reads project_members, sends
-- Postgres into infinite recursion. `security definer` runs the lookup as the function
-- owner, which bypasses RLS on the inner read and terminates the cycle.
--
-- `stable` lets the planner hoist the call out of the per-row loop. `set search_path`
-- is mandatory on a security definer function: without it a caller can shadow
-- `project_members` with their own object and the function reads that instead.

create or replace function public.is_project_member(p_project_id uuid)
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

create or replace function public.is_project_owner(p_project_id uuid)
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

revoke execute on function public.is_project_member(uuid) from public, anon;
revoke execute on function public.is_project_owner(uuid)  from public, anon;
grant  execute on function public.is_project_member(uuid) to authenticated;
grant  execute on function public.is_project_owner(uuid)  to authenticated;

-- projects -------------------------------------------------------------------------
-- auth.uid() is wrapped as (select auth.uid()) inside the helpers so it is evaluated
-- once per statement rather than once per row.

create policy "members read projects" on public.projects
  for select to authenticated
  using (public.is_project_member(id));

create policy "owners update projects" on public.projects
  for update to authenticated
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));

create policy "owners delete projects" on public.projects
  for delete to authenticated
  using (public.is_project_owner(id));

-- Deliberately no INSERT policy. A brand-new project has no members, so a
-- member-based check could never pass, and an "any authenticated user" check would let
-- someone create a row they cannot then read. create_project() below is the only way in.

-- project_members ------------------------------------------------------------------
-- Every membership-dependent predicate goes through a helper rather than a direct
-- subquery on project_members; that is what keeps these from re-entering their own
-- policy. The bare user_id comparison in the delete policy is safe because it reads the
-- row's own column and issues no subquery.

create policy "members read membership" on public.project_members
  for select to authenticated
  using (public.is_project_member(project_id));

create policy "owners add members" on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id));

create policy "owners update members" on public.project_members
  for update to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

create policy "owners remove members, members may leave" on public.project_members
  for delete to authenticated
  using (public.is_project_owner(project_id) or user_id = (select auth.uid()));

-- Project creation -------------------------------------------------------------------
-- Creates the project and its owner membership in one transaction, so a project can
-- never exist without someone able to see it.

create or replace function public.create_project(p_name text, p_description text default null)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_project public.projects;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.projects (name, description, created_by)
  values (p_name, p_description, v_uid)
  returning * into v_project;

  insert into public.project_members (project_id, user_id, role)
  values (v_project.id, v_uid, 'owner');

  return v_project;
end;
$$;

revoke execute on function public.create_project(text, text) from public, anon;
grant  execute on function public.create_project(text, text) to authenticated;
