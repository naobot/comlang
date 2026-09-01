-- Access layer: projects and their membership.
--
-- Every other table in this database will hang off project_id and gate itself with the
-- helpers defined in 0002. Nothing conlang-specific belongs here.

create type project_role as enum ('owner', 'collaborator');

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  created_by  uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id)     on delete cascade,
  role       project_role not null default 'collaborator',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Membership is looked up by user ("which projects are mine") on every dashboard load.
-- project_id leads the primary key, so the by-project direction is already indexed.
create index project_members_user_id_idx on public.project_members (user_id);

-- Keep updated_at honest without making every caller remember it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
