-- Linguistic core, part 5: word classes and the inflectional categories they carry.
--
-- This section was designed once and tabled, because the obvious model — a class owns an
-- ordered chain of morpheme slots — is one grammar.yaml resists in five places:
-- `morpheme_order.nominal` splits its template across a word boundary via
-- `phonological_word`, `semantic_particle` occupies the case slot instead of a case
-- marker, plural is reduplication rather than an affix, evidentiality is a final coda
-- rather than a full morpheme, and `categories` does not line up with `closed_class`.
--
-- So this round models the part the source states outright and stops at the part it does
-- not: **which classes exist, and which categories each one inflects for**. Morpheme
-- order stays deferred, deliberately, and gets its own design pass.
--
-- Every table carries project_id — as in 0010, that is not only for the RLS copy-paste
-- but because subscribeToProjectTable() filters on `project_id=eq.<id>`, so a table
-- without the column cannot use the existing realtime machinery at all.

create type word_class_kind as enum ('open', 'closed');

-- A part of speech. `name` is what `lexicon_entries.word_class` holds, so it is the
-- natural key. `kind` is the open/closed distinction: an open class takes new members
-- freely (noun, verb), a closed one is a fixed inventory (case marker, numeral).
--
-- grammar.yaml's `meta.missing` records that whether the copula is open and the
-- evidential closed is itself an open question upstream, which is a good reason for this
-- to be an editable field rather than something inferred.
create table public.word_classes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  kind        word_class_kind not null default 'open',
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, name)
);

-- An inflectional category: person, number, case, tense, force, evidential, deixis.
-- Named to match grammar.yaml's `categories` block, which is exactly what it transcribes.
create table public.grammatical_categories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, name)
);

-- One value of a category: `singular`, `plural`, `paucal`.
--
-- `notes` carries what the source says about a value in prose — upstream, `paucal` is
-- annotated "reduplication without numeral+counter", which is a fact about the value and
-- has nowhere else to go until morpheme order is modelled.
create table public.category_values (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  category_id uuid not null references public.grammatical_categories (id) on delete cascade,
  value       text not null check (length(trim(value)) > 0),
  notes       text,
  sort_order  int not null default 0,
  unique (category_id, value)
);

-- Which classes inflect for which categories. Both sides cascade, unlike the phonotactics
-- slot/class pair: deleting a category here is an explicit act on this same page, where
-- the editor shows what it is attached to, so there is no silent loss to guard against.
create table public.word_class_categories (
  project_id    uuid not null references public.projects (id) on delete cascade,
  word_class_id uuid not null references public.word_classes (id) on delete cascade,
  category_id   uuid not null references public.grammatical_categories (id) on delete cascade,
  primary key (word_class_id, category_id)
);

create index word_classes_project_id_idx            on public.word_classes (project_id);
create index grammatical_categories_project_id_idx  on public.grammatical_categories (project_id);
create index category_values_project_id_idx         on public.category_values (project_id);
create index category_values_category_id_idx        on public.category_values (category_id, sort_order);
create index word_class_categories_project_id_idx   on public.word_class_categories (project_id);
create index word_class_categories_category_id_idx  on public.word_class_categories (category_id);

create trigger word_classes_touch_updated_at
  before update on public.word_classes
  for each row execute function public.touch_updated_at();

create trigger grammatical_categories_touch_updated_at
  before update on public.grammatical_categories
  for each row execute function public.touch_updated_at();

alter table public.word_classes           enable row level security;
alter table public.grammatical_categories enable row level security;
alter table public.category_values        enable row level security;
alter table public.word_class_categories  enable row level security;

-- Policies follow 0004: all four verbs to any member. Content is member-editable;
-- owner-only stays scoped to settings and membership.
create policy "members read word_classes"   on public.word_classes for select to authenticated using (private.is_project_member(project_id));
create policy "members insert word_classes" on public.word_classes for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update word_classes" on public.word_classes for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete word_classes" on public.word_classes for delete to authenticated using (private.is_project_member(project_id));

create policy "members read categories"   on public.grammatical_categories for select to authenticated using (private.is_project_member(project_id));
create policy "members insert categories" on public.grammatical_categories for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update categories" on public.grammatical_categories for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete categories" on public.grammatical_categories for delete to authenticated using (private.is_project_member(project_id));

create policy "members read category_values"   on public.category_values for select to authenticated using (private.is_project_member(project_id));
create policy "members insert category_values" on public.category_values for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update category_values" on public.category_values for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete category_values" on public.category_values for delete to authenticated using (private.is_project_member(project_id));

create policy "members read class_categories"   on public.word_class_categories for select to authenticated using (private.is_project_member(project_id));
create policy "members insert class_categories" on public.word_class_categories for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update class_categories" on public.word_class_categories for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete class_categories" on public.word_class_categories for delete to authenticated using (private.is_project_member(project_id));

-- Activity stamping, as 0018 does for every other content table. Security definer there,
-- and required: `projects` has an owner-only UPDATE policy, so a collaborator editing this
-- section could not otherwise stamp the project.
create trigger word_classes_touch_activity
  after insert or update or delete on public.word_classes
  for each row execute function public.touch_project_activity();

create trigger grammatical_categories_touch_activity
  after insert or update or delete on public.grammatical_categories
  for each row execute function public.touch_project_activity();

create trigger category_values_touch_activity
  after insert or update or delete on public.category_values
  for each row execute function public.touch_project_activity();

create trigger word_class_categories_touch_activity
  after insert or update or delete on public.word_class_categories
  for each row execute function public.touch_project_activity();

-- The whole page in one transaction, as with save_phonotactics: the link table makes a
-- partially applied save worse than a rejected one, and reordering is multi-row anyway.
--
-- The payload refers to classes and categories by *name*, never by id, so the client
-- never has to invent an id for something it has only just created.
create or replace function public.save_word_classes(p_project_id uuid, p_payload jsonb)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_classes    jsonb := coalesce(p_payload -> 'classes', '[]'::jsonb);
  v_categories jsonb := coalesce(p_payload -> 'categories', '[]'::jsonb);
  v_class      jsonb;
  v_category   jsonb;
  v_value      jsonb;
  v_class_id   uuid;
  v_cat_id     uuid;
  v_cat_name   text;
begin
  -- Deliberately NOT security definer: RLS is the boundary and the policies above
  -- already say who may write. This guard only turns a silent no-op into a clear error.
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  -- 1. Upsert on the natural key rather than recreating, so ids survive a save. Nothing
  --    outside this page points at them yet, but lexicon entries are matched by class
  --    *name*, and a future foreign key would want stable ids to land on.
  for v_category in select * from jsonb_array_elements(v_categories)
  loop
    insert into public.grammatical_categories (project_id, name, description, sort_order)
    values (
      p_project_id,
      v_category ->> 'name',
      nullif(v_category ->> 'description', ''),
      coalesce((v_category ->> 'sort_order')::int, 0)
    )
    on conflict (project_id, name) do update
      set description = excluded.description, sort_order = excluded.sort_order;
  end loop;

  for v_class in select * from jsonb_array_elements(v_classes)
  loop
    insert into public.word_classes (project_id, name, kind, description, sort_order)
    values (
      p_project_id,
      v_class ->> 'name',
      coalesce(nullif(v_class ->> 'kind', ''), 'open')::word_class_kind,
      nullif(v_class ->> 'description', ''),
      coalesce((v_class ->> 'sort_order')::int, 0)
    )
    on conflict (project_id, name) do update
      set kind = excluded.kind,
          description = excluded.description,
          sort_order = excluded.sort_order;
  end loop;

  -- 2. Clear what hangs off them, before anything can be dropped. Both would cascade,
  --    but rebuilding explicitly is what lets a value be renamed or reordered.
  delete from public.word_class_categories where project_id = p_project_id;
  delete from public.category_values       where project_id = p_project_id;

  -- 3. Prune. An empty array clears the section, since `not in (empty set)` is true for
  --    every row.
  delete from public.word_classes
   where project_id = p_project_id
     and name not in (select value ->> 'name' from jsonb_array_elements(v_classes));

  delete from public.grammatical_categories
   where project_id = p_project_id
     and name not in (select value ->> 'name' from jsonb_array_elements(v_categories));

  -- 4. Values.
  for v_category in select * from jsonb_array_elements(v_categories)
  loop
    select id into v_cat_id
      from public.grammatical_categories
     where project_id = p_project_id and name = v_category ->> 'name';

    for v_value in select * from jsonb_array_elements(coalesce(v_category -> 'values', '[]'::jsonb))
    loop
      insert into public.category_values (project_id, category_id, value, notes, sort_order)
      values (
        p_project_id,
        v_cat_id,
        v_value ->> 'value',
        nullif(v_value ->> 'notes', ''),
        coalesce((v_value ->> 'sort_order')::int, 0)
      );
    end loop;
  end loop;

  -- 5. Which class inflects for which category. A link naming a category that is not in
  --    the payload is an error rather than a silent drop: it means the draft and the
  --    thing it refers to disagree, and quietly saving half of that is how a
  --    collaborator loses work.
  for v_class in select * from jsonb_array_elements(v_classes)
  loop
    select id into v_class_id
      from public.word_classes
     where project_id = p_project_id and name = v_class ->> 'name';

    for v_cat_name in
      select jsonb_array_elements_text(coalesce(v_class -> 'categories', '[]'::jsonb))
    loop
      select id into v_cat_id
        from public.grammatical_categories
       where project_id = p_project_id and name = v_cat_name;

      if v_cat_id is null then
        raise exception 'class "%" refers to unknown category "%"', v_class ->> 'name', v_cat_name
          using errcode = 'foreign_key_violation';
      end if;

      insert into public.word_class_categories (project_id, word_class_id, category_id)
      values (p_project_id, v_class_id, v_cat_id)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.save_word_classes(uuid, jsonb) from public, anon;
grant  execute on function public.save_word_classes(uuid, jsonb) to authenticated;
