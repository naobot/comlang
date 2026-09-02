-- A syllable slot may now name its phonemes outright, instead of only naming a class and
-- taking whatever is in it.
--
-- The class stays on the slot. It is what the CVC notation is built from and what a
-- class-based constraint matches against, and a segment generated into a restricted slot
-- still carries that class — so `forbid_in_role C onset` keeps firing exactly as before.
-- The class is the slot's identity and the seed of its selection, not a fence around it.
--
-- NULL means "the whole class", which is what every existing row reads back as and what
-- keeps an untouched slot tracking edits to its class. A non-empty array is an explicit
-- set. The two must not be confusable with a third state: an empty override is a slot
-- nothing can fill, which is a mistake rather than something to persist, so the check
-- refuses it and the editor's Done is disabled at zero selected.
--
-- Stored as IPA text rather than foreign keys, following 0012 and 0013 — a slot's set has
-- to survive the segment leaving the inventory so the page can show it in red instead of
-- silently shrinking. `orphanedSlotMembers` in src/lib/phonotactics.ts does that check,
-- and `resolveGrammar` filters the set against the inventory for the same reason it
-- filters class membership: otherwise removing a phoneme would change the chart and
-- nothing else.

alter table public.syllable_slots
  add column phoneme_ipa text[],
  add constraint phoneme_ipa_nonempty
    check (phoneme_ipa is null or cardinality(phoneme_ipa) > 0);

comment on column public.syllable_slots.phoneme_ipa is
  'Explicit segments allowed in this slot, as IPA text. NULL means the whole class.';

-- Unchanged from 0013 apart from the slot insert carrying the new column. Repeated in
-- full because `create or replace` has no way to patch one statement.
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
      insert into public.phoneme_class_members (project_id, class_id, ipa)
      values (p_project_id, v_class_id, v_ipa)
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

      insert into public.syllable_slots (project_id, template_id, class_id, slot_index, role, optional, phoneme_ipa)
      values (
        p_project_id,
        v_template_id,
        v_class_id,
        (v_slot ->> 'slot_index')::int,
        (v_slot ->> 'role')::slot_role,
        coalesce((v_slot ->> 'optional')::boolean, false),
        -- Anything that is not a JSON array — absent, or an explicit null — means "the
        -- whole class". An empty array collapses to NULL through array_agg, which the
        -- check then accepts as the same thing; the client never sends one.
        case when jsonb_typeof(v_slot -> 'phoneme_ipa') = 'array'
             then (select array_agg(value) from jsonb_array_elements_text(v_slot -> 'phoneme_ipa'))
             else null end
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
      nullif(v_constraint ->> 'a_phoneme_ipa', ''),
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'b_class_symbol'),
      nullif(v_constraint ->> 'b_phoneme_ipa', ''),
      nullif(v_constraint ->> 'note', '')
    );
  end loop;
end;
$$;

revoke execute on function public.save_phonotactics(uuid, jsonb) from public, anon;
grant  execute on function public.save_phonotactics(uuid, jsonb) to authenticated;
