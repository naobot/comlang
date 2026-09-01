-- Keep a phonotactic rule when the segment it names leaves the inventory.
--
-- 0010 pointed a constraint's terms at `phonemes.id` with `on delete cascade`, so
-- removing /ŋ/ deleted "ŋ cannot be an onset" outright — a rule someone deliberately
-- wrote, gone with nothing left to reconstruct it from. Verified happening: dropping one
-- phoneme took a two-constraint set down to one.
--
-- The fix is to stop making it a foreign key. A term now stores the IPA symbol as text,
-- so the reference is allowed to dangle, and a dangling reference is exactly what the UI
-- needs in order to show the rule in red instead of quietly losing it.
--
-- The trade is deliberate: the database no longer guarantees a constraint names a
-- segment that exists. It cannot, if the rule is to survive at all — so the check moves
-- to the client, which compares against the inventory and flags what it finds.
--
-- Class terms keep their foreign key. Deleting a class is an explicit act on the
-- phonotactics page itself, where the editor already prunes the rules that used it;
-- there is no silent loss to prevent.

alter table public.phonotactic_constraints
  add column a_phoneme_ipa text,
  add column b_phoneme_ipa text;

update public.phonotactic_constraints c
   set a_phoneme_ipa = (select p.ipa from public.phonemes p where p.id = c.a_phoneme_id),
       b_phoneme_ipa = (select p.ipa from public.phonemes p where p.id = c.b_phoneme_id);

-- The checks name the old columns, so they have to go before the columns can.
alter table public.phonotactic_constraints
  drop constraint a_is_one_thing,
  drop constraint b_is_one_thing,
  drop constraint kind_shape;

alter table public.phonotactic_constraints
  drop column a_phoneme_id,
  drop column b_phoneme_id;

alter table public.phonotactic_constraints
  add constraint a_is_one_thing check (num_nonnulls(a_class_id, a_phoneme_ipa) <= 1),
  add constraint b_is_one_thing check (num_nonnulls(b_class_id, b_phoneme_ipa) <= 1),
  add constraint kind_shape check (
    case kind
      when 'forbid_in_role' then
        role is not null
        and num_nonnulls(a_class_id, a_phoneme_ipa) = 1
        and num_nonnulls(b_class_id, b_phoneme_ipa) = 0
      when 'forbid_sequence' then
        seq_position is not null
        and num_nonnulls(a_class_id, a_phoneme_ipa) = 1
        and num_nonnulls(b_class_id, b_phoneme_ipa) = 1
      when 'no_identical_adjacent' then
        num_nonnulls(a_class_id, a_phoneme_ipa, b_class_id, b_phoneme_ipa) = 0
    end
  );

-- The constraint block of save_phonotactics no longer resolves a symbol to an id: the
-- payload already carries the IPA, and writing it straight through is what lets a rule
-- name a segment the inventory has since lost.
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
  if not private.is_project_member(p_project_id) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

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

  delete from public.syllable_slots          where project_id = p_project_id;
  delete from public.phonotactic_constraints where project_id = p_project_id;
  delete from public.phoneme_class_members   where project_id = p_project_id;

  delete from public.phoneme_classes
   where project_id = p_project_id
     and symbol not in (select value ->> 'symbol' from jsonb_array_elements(v_classes));

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

  for v_constraint in select * from jsonb_array_elements(v_constraints)
  loop
    insert into public.phonotactic_constraints (
      project_id, kind, role, seq_position,
      a_class_id, a_phoneme_ipa, b_class_id, b_phoneme_ipa, note
    )
    values (
      p_project_id,
      (v_constraint ->> 'kind')::constraint_kind,
      nullif(v_constraint ->> 'role', '')::slot_role,
      nullif(v_constraint ->> 'seq_position', '')::sequence_position,
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'a_class_symbol'),
      -- Written straight through, deliberately unchecked against the inventory.
      nullif(v_constraint ->> 'a_phoneme_ipa', ''),
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'b_class_symbol'),
      nullif(v_constraint ->> 'b_phoneme_ipa', ''),
      nullif(v_constraint ->> 'note', '')
    );
  end loop;
end;
$$;
