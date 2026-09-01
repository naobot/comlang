-- Keep class membership when a segment leaves the inventory, for the same reason 0012
-- kept the rules: curating a class is work, and losing it silently is worse than seeing
-- it broken. Removing /ŋ/ and putting it back left it out of every class it had been in,
-- with nothing to say it ever was.
--
-- Same trade as 0012: membership stores the IPA symbol rather than a foreign key, so the
-- reference may dangle and the class editor can show it in red.
--
-- Consequence to be careful about: a class may now name a segment the language does not
-- have, so **the generator must filter class members against the inventory** or removing
-- a phoneme would not actually stop it being produced. `resolveGrammar` in
-- src/lib/phonotactics.ts does that, and its tests pin it.

alter table public.phoneme_class_members add column ipa text;

update public.phoneme_class_members m
   set ipa = (select p.ipa from public.phonemes p where p.id = m.phoneme_id);

alter table public.phoneme_class_members drop constraint phoneme_class_members_pkey;
alter table public.phoneme_class_members drop column phoneme_id;

delete from public.phoneme_class_members where ipa is null;
alter table public.phoneme_class_members alter column ipa set not null;
alter table public.phoneme_class_members add primary key (class_id, ipa);

-- save_phonotactics no longer resolves a symbol to a phoneme row, and no longer refuses
-- a member that is not in the inventory. It cannot: after a phoneme is deleted the class
-- legitimately holds a dangling symbol, and rejecting that would leave the page unable to
-- save anything at all until the user noticed and fixed it by hand.
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
      nullif(v_constraint ->> 'a_phoneme_ipa', ''),
      (select id from public.phoneme_classes
        where project_id = p_project_id and symbol = v_constraint ->> 'b_class_symbol'),
      nullif(v_constraint ->> 'b_phoneme_ipa', ''),
      nullif(v_constraint ->> 'note', '')
    );
  end loop;
end;
$$;
