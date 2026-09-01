-- Profiles, and adding a collaborator from inside the app.
--
-- The client cannot read auth.users, so there was no way to turn "naomi@nowme.ca" into
-- a user id, and no way to render a member list as anything but raw UUIDs. profiles is
-- the readable mirror of auth.users that the rest of the app is allowed to see.
--
-- It is also where per-user data belongs later (display names on lexicon entries, say),
-- which is why this is a table rather than just an email-lookup RPC.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Mirror auth.users into profiles. Runs on signup and on an email change, so the
-- mirror cannot silently drift from the source.
create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_from_auth_user();

-- Backfill the accounts that already exist.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

-- You may see a profile if it is yours, or if you already share a project with that
-- person. This is not a user directory: it exposes exactly the people you collaborate
-- with, and nobody else.
create or replace function private.shares_project_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

revoke execute on function private.shares_project_with(uuid) from public, anon;
grant  execute on function private.shares_project_with(uuid) to authenticated;

create policy "read own and collaborators' profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_project_with(id));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert or delete policy: profiles are created and removed by the auth trigger and
-- the cascade from auth.users, never by a client.

-- Adding a member -------------------------------------------------------------------
-- Email lookup has to run with elevated rights (the caller cannot see a profile for
-- someone they do not yet share a project with — which is precisely everyone they are
-- about to invite). The owner check is therefore explicit inside the function.
--
-- Note this does tell an owner whether a given email has an account. That is a
-- deliberate, contained trade: without it there is no way to invite anyone.

create or replace function public.add_project_member(
  p_project_id uuid,
  p_email      text,
  p_role       project_role default 'collaborator'
)
returns public.project_members
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_member  public.project_members;
begin
  if not private.is_project_owner(p_project_id) then
    raise exception 'only an owner can add members' using errcode = '42501';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'no account for %', p_email using errcode = 'no_data_found';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_user_id, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role
  returning * into v_member;

  return v_member;
end;
$$;

revoke execute on function public.add_project_member(uuid, text, project_role) from public, anon;
grant  execute on function public.add_project_member(uuid, text, project_role) to authenticated;

alter publication supabase_realtime add table public.profiles;
alter table public.profiles replica identity full;

-- project_members.user_id already references auth.users, but PostgREST can only embed
-- profiles into a members query if there is a foreign key it can see between the two.
-- Without this, `select("*, profile:profiles(...)")` fails with
-- "could not find the relation between project_members and profiles".
--
-- Safe to add: profiles is populated for every auth user by the sync trigger, and
-- deleting an auth user cascades to both tables.
alter table public.project_members
  add constraint project_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
