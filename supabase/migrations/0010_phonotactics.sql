-- Linguistic core, part 2: phonotactics — named phoneme classes, syllable templates,
-- and machine-checkable constraints. Together these are a *generative* model: enough
-- for src/lib/phonotactics.ts to sample a well-formed word, which is what a later word
-- generator will reuse.
--
-- Nothing upstream corresponds to this. grammar.yaml has no phonotactics section at all.
-- What it has is named sets of bare IPA strings (`glides`, `nasals`, `places.labial`),
-- with `places.labial` referenced by name from `negation_prefix.allomorphs` — so classes
-- are transcription, and templates and constraints are a layer we are adding.
--
-- Every table carries project_id. That is not only for the RLS copy-paste: the client's
-- subscribeToProjectTable() filters on `project_id=eq.<id>`, so a table without the
-- column cannot use the existing realtime machinery at all. On the join table that means
-- a denormalized column, which is the right trade.

create type slot_role         as enum ('onset', 'nucleus', 'coda');
create type constraint_kind   as enum ('forbid_in_role', 'forbid_sequence', 'no_identical_adjacent');
create type sequence_position as enum ('anywhere', 'word_initial', 'word_final');

-- A named set of segments: "C", "V", "N". `symbol` is what appears inside a template,
-- so it doubles as the class's natural key. Overlapping membership is expected and
-- normal — ŋ is both a nasal and a velar, exactly as in grammar.yaml.
create table public.phoneme_classes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  symbol     text not null check (length(trim(symbol)) > 0),
  label      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, symbol)
);

create table public.phoneme_class_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  class_id   uuid not null references public.phoneme_classes (id) on delete cascade,
  -- Cascade is deliberate, and it has a consequence worth knowing: deselecting a
  -- phoneme on the inventory page removes it from every class that held it.
  phoneme_id uuid not null references public.phonemes (id) on delete cascade,
  primary key (class_id, phoneme_id)
);

create table public.syllable_templates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  weight     int not null default 1 check (weight > 0),  -- relative sampling frequency
  sort_order int not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.syllable_slots (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  template_id uuid not null references public.syllable_templates (id) on delete cascade,
  -- restrict, not cascade: deleting a class a template still uses should fail loudly
  -- rather than quietly gut the template. save_phonotactics clears slots first so a
  -- legitimate removal of both together still goes through.
  class_id    uuid not null references public.phoneme_classes (id) on delete restrict,
  slot_index  int not null,
  role        slot_role not null,
  optional    boolean not null default false,
  unique (template_id, slot_index)
);

create table public.phonotactic_constraints (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  kind         constraint_kind not null,
  role         slot_role null,
  seq_position sequence_position null,
  -- Two terms, each either a whole class or a single phoneme. Capped at two on purpose:
  -- it covers every constraint the design called for, and keeps the foreign-key
  -- integrity a jsonb term list would lose. A three-term constraint is a schema change,
  -- knowingly.
  a_class_id   uuid references public.phoneme_classes (id) on delete cascade,
  a_phoneme_id uuid references public.phonemes (id)        on delete cascade,
  b_class_id   uuid references public.phoneme_classes (id) on delete cascade,
  b_phoneme_id uuid references public.phonemes (id)        on delete cascade,
  note         text,
  created_at   timestamptz not null default now(),
  constraint a_is_one_thing check (num_nonnulls(a_class_id, a_phoneme_id) <= 1),
  constraint b_is_one_thing check (num_nonnulls(b_class_id, b_phoneme_id) <= 1),
  -- Each kind has a different shape, and the database is the right place to say so:
  -- a forbid_sequence with one term would otherwise reach the generator and be ignored.
  constraint kind_shape check (
    case kind
      when 'forbid_in_role' then
        role is not null
        and num_nonnulls(a_class_id, a_phoneme_id) = 1
        and num_nonnulls(b_class_id, b_phoneme_id) = 0
      when 'forbid_sequence' then
        seq_position is not null
        and num_nonnulls(a_class_id, a_phoneme_id) = 1
        and num_nonnulls(b_class_id, b_phoneme_id) = 1
      when 'no_identical_adjacent' then
        num_nonnulls(a_class_id, a_phoneme_id, b_class_id, b_phoneme_id) = 0
    end
  )
);

create index phoneme_classes_project_id_idx        on public.phoneme_classes (project_id);
create index phoneme_class_members_project_id_idx  on public.phoneme_class_members (project_id);
create index phoneme_class_members_phoneme_id_idx  on public.phoneme_class_members (phoneme_id);
create index syllable_templates_project_id_idx     on public.syllable_templates (project_id);
create index syllable_slots_project_id_idx         on public.syllable_slots (project_id);
create index syllable_slots_template_id_idx        on public.syllable_slots (template_id, slot_index);
create index syllable_slots_class_id_idx           on public.syllable_slots (class_id);
create index phonotactic_constraints_project_id_idx on public.phonotactic_constraints (project_id);

create trigger phoneme_classes_touch_updated_at
  before update on public.phoneme_classes
  for each row execute function public.touch_updated_at();

create trigger syllable_templates_touch_updated_at
  before update on public.syllable_templates
  for each row execute function public.touch_updated_at();

alter table public.phoneme_classes         enable row level security;
alter table public.phoneme_class_members   enable row level security;
alter table public.syllable_templates      enable row level security;
alter table public.syllable_slots          enable row level security;
alter table public.phonotactic_constraints enable row level security;

-- Policies follow 0004. All four verbs to any member: the language is what a
-- collaborator is here to edit, and owner-only stays scoped to settings and membership.
create policy "members read phoneme_classes"   on public.phoneme_classes   for select to authenticated using (private.is_project_member(project_id));
create policy "members insert phoneme_classes" on public.phoneme_classes   for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update phoneme_classes" on public.phoneme_classes   for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete phoneme_classes" on public.phoneme_classes   for delete to authenticated using (private.is_project_member(project_id));

create policy "members read class_members"   on public.phoneme_class_members for select to authenticated using (private.is_project_member(project_id));
create policy "members insert class_members" on public.phoneme_class_members for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update class_members" on public.phoneme_class_members for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete class_members" on public.phoneme_class_members for delete to authenticated using (private.is_project_member(project_id));

create policy "members read templates"   on public.syllable_templates for select to authenticated using (private.is_project_member(project_id));
create policy "members insert templates" on public.syllable_templates for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update templates" on public.syllable_templates for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete templates" on public.syllable_templates for delete to authenticated using (private.is_project_member(project_id));

create policy "members read slots"   on public.syllable_slots for select to authenticated using (private.is_project_member(project_id));
create policy "members insert slots" on public.syllable_slots for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update slots" on public.syllable_slots for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete slots" on public.syllable_slots for delete to authenticated using (private.is_project_member(project_id));

create policy "members read constraints"   on public.phonotactic_constraints for select to authenticated using (private.is_project_member(project_id));
create policy "members insert constraints" on public.phonotactic_constraints for insert to authenticated with check (private.is_project_member(project_id));
create policy "members update constraints" on public.phonotactic_constraints for update to authenticated using (private.is_project_member(project_id)) with check (private.is_project_member(project_id));
create policy "members delete constraints" on public.phonotactic_constraints for delete to authenticated using (private.is_project_member(project_id));

-- The whole page in one transaction. The foreign-key web between these five tables
-- makes a partially applied save worse than a rejected one.
--
-- The payload refers to classes by `symbol` and to phonemes by `ipa` rather than by id,
-- so the client never has to invent ids for things it just created; this function
-- resolves them and raises if a reference does not exist.
create or replace function public.save_phonotactics(p_project_id uuid, p_payload jsonb)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_classes     jsonb := coalesce(p_payload -> 'classes', '[]'::jsonb);
  v_templates   jsonb := coalesce(p_payload -> 'templates', '[]'::jsonb);
  v_constraints jsonb := coalesce(p_payload -> 'constraints', '[]'::jsonb);
  v_class       jsonb;
  v_template    jsonb;
  v_slot        jsonb;
  v_constraint  jsonb;
  v_class_id    uuid;
  v_template_id uuid;
  v_phoneme_id  uuid;
  v_ipa         text;
begin
  -- Deliberately NOT security definer: RLS is the boundary, and the policies above
  -- already say who may write. This guard only turns a silent no-op into a clear error.
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  -- 1. Upsert classes on the natural key. Matching rather than recreating is what keeps
  --    class ids stable across a save; slots and constraints reference them, so a
  --    delete-and-recreate would churn every foreign key on every save.
  for v_class in select * from jsonb_array_elements(v_classes)
  loop
    insert into public.phoneme_classes (project_id, symbol, label, sort_order)
    values (
      p_project_id,
      v_class ->> 'symbol',
      nullif(v_class ->> 'label', ''),
      coalesce((v_class ->> 'sort_order')::int, 0)
    )
    on conflict (project_id, symbol) do update
      set label = excluded.label, sort_order = excluded.sort_order;
  end loop;

  -- 2. Clear everything that points at a class, before any class can be dropped.
  --    syllable_slots.class_id is ON DELETE RESTRICT exactly so a class cannot vanish
  --    from under a live template — which also means these have to go first.
  delete from public.syllable_slots          where project_id = p_project_id;
  delete from public.phonotactic_constraints where project_id = p_project_id;
  delete from public.phoneme_class_members   where project_id = p_project_id;

  -- 3. Classes absent from the payload. An empty array clears them all, because
  --    `not in (empty set)` is true for every row.
  delete from public.phoneme_classes
   where project_id = p_project_id
     and symbol not in (select value ->> 'symbol' from jsonb_array_elements(v_classes));

  -- 4. Membership.
  for v_class in select * from jsonb_array_elements(v_classes)
  loop
    select id into v_class_id
      from public.phoneme_classes
     where project_id = p_project_id and symbol = v_class ->> 'symbol';

    for v_ipa in
      select jsonb_array_elements_text(coalesce(v_class -> 'phoneme_ipa', '[]'::jsonb))
    loop
      select id into v_phoneme_id
        from public.phonemes
       where project_id = p_project_id and ipa = v_ipa;

      if v_phoneme_id is null then
        raise exception '/%/ is not in this project''s phoneme inventory', v_ipa
          using errcode = 'foreign_key_violation';
      end if;

      insert into public.phoneme_class_members (project_id, class_id, phoneme_id)
      values (p_project_id, v_class_id, v_phoneme_id)
      on conflict do nothing;
    end loop;
  end loop;

  -- 5. Templates, also upserted on their natural key, then their slots rebuilt. Slot
  --    ids are not stable, which is fine: nothing references a slot.
  for v_template in select * from jsonb_array_elements(v_templates)
  loop
    insert into public.syllable_templates (project_id, name, weight, sort_order, notes)
    values (
      p_project_id,
      v_template ->> 'name',
      coalesce((v_template ->> 'weight')::int, 1),
      coalesce((v_template ->> 'sort_order')::int, 0),
      nullif(v_template ->> 'notes', '')
    )
    on conflict (project_id, name) do update
      set weight = excluded.weight, sort_order = excluded.sort_order, notes = excluded.notes
    returning id into v_template_id;

    for v_slot in select * from jsonb_array_elements(coalesce(v_template -> 'slots', '[]'::jsonb))
    loop
      select id into v_class_id
        from public.phoneme_classes
       where project_id = p_project_id and symbol = v_slot ->> 'class_symbol';

      if v_class_id is null then
        raise exception 'slot references unknown class "%"', v_slot ->> 'class_symbol'
          using errcode = 'foreign_key_violation';
      end if;

      insert into public.syllable_slots (project_id, template_id, class_id, slot_index, role, optional)
      values (
        p_project_id,
        v_template_id,
        v_class_id,
        (v_slot ->> 'slot_index')::int,
        (v_slot ->> 'role')::slot_role,
        coalesce((v_slot ->> 'optional')::boolean, false)
      );
    end loop;
  end loop;

  delete from public.syllable_templates
   where project_id = p_project_id
     and name not in (select value ->> 'name' from jsonb_array_elements(v_templates));

  -- 6. Constraints are rebuilt wholesale: they have no natural key and nothing points
  --    at them, so churning their ids costs nothing. A reference that does not resolve
  --    lands as NULL and is caught by the kind_shape check rather than passing silently.
  for v_constraint in select * from jsonb_array_elements(v_constraints)
  loop
    insert into public.phonotactic_constraints (
      project_id, kind, role, seq_position,
      a_class_id, a_phoneme_id, b_class_id, b_phoneme_id, note
    )
    values (
      p_project_id,
      (v_constraint ->> 'kind')::constraint_kind,
      nullif(v_constraint ->> 'role', '')::slot_role,
      nullif(v_constraint ->> 'seq_position', '')::sequence_position,
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'a_class_symbol'),
      (select id from public.phonemes
        where project_id = p_project_id and ipa = v_constraint ->> 'a_phoneme_ipa'),
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'b_class_symbol'),
      (select id from public.phonemes
        where project_id = p_project_id and ipa = v_constraint ->> 'b_phoneme_ipa'),
      nullif(v_constraint ->> 'note', '')
    );
  end loop;
end;
$$;

revoke execute on function public.save_phonotactics(uuid, jsonb) from public, anon;
grant  execute on function public.save_phonotactics(uuid, jsonb) to authenticated;
