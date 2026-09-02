import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import {
  type Draft,
  type DraftCategory,
  type DraftClass,
  canonicalDraft,
  cloneDraft,
  emptyCategory,
  emptyClass,
  emptyDraft,
  problems,
} from "@/lib/wordClasses";
import type { CategoryValue, GrammaticalCategory, WordClass } from "@/types/models";

/**
 * Word classes and the categories they inflect for.
 *
 * Whole-page explicit save through `save_word_classes`, like phonotactics: the link
 * between a class and a category spans two tables plus a join, so a per-row save could
 * leave a class pointing at a category that the same edit removed.
 *
 * Echo detection is the **compare** strategy, not the `ownWrites` id set — as the
 * phonotactics note says, one save writes across four tables at once, and id bookkeeping
 * across that is fragile where a re-read and a comparison is provably right.
 */

type ClassCategoryRow = { word_class_id: string; category_id: string };

export const useWordClassesStore = defineStore("wordClasses", () => {
  const persisted = ref<Draft>(emptyDraft());
  const draft = ref<Draft>(emptyDraft());

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const changedElsewhere = ref(false);
  /** A collaborator's version, held aside so "load theirs" is not a round trip. */
  let incoming: Draft | null = null;

  const dirty = computed(() => canonicalDraft(draft.value) !== canonicalDraft(persisted.value));
  const classCount = computed(() => persisted.value.classes.length);
  const categoryCount = computed(() => persisted.value.categories.length);
  /** Names as saved, for the lexicon's class picker — a draft must not steer it. */
  const classNames = computed(() => persisted.value.classes.map((c) => c.name));

  function adopt(next: Draft) {
    persisted.value = cloneDraft(next);
    draft.value = cloneDraft(next);
    changedElsewhere.value = false;
    incoming = null;
  }

  /** Four tables in, one nested draft out. */
  async function read(projectId: string): Promise<Draft | null> {
    const [classesQ, categoriesQ, valuesQ, linksQ] = await Promise.all([
      // Name as a tiebreaker, so rows that share a sort_order still come back in a
      // stable order — a seed loaded straight into the RPC can leave them all at 0.
      supabase
        .from("word_classes")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("grammatical_categories")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("category_values")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("value"),
      supabase.from("word_class_categories").select("*").eq("project_id", projectId),
    ]);

    const failed = [classesQ, categoriesQ, valuesQ, linksQ].find((q) => q.error);
    if (failed?.error) {
      error.value = failed.error.message;
      return null;
    }

    const classRows = (classesQ.data ?? []) as WordClass[];
    const categoryRows = (categoriesQ.data ?? []) as GrammaticalCategory[];
    const valueRows = (valuesQ.data ?? []) as CategoryValue[];
    const linkRows = (linksQ.data ?? []) as ClassCategoryRow[];

    const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));
    const linksByClass = new Map<string, string[]>();
    for (const link of linkRows) {
      const name = categoryNameById.get(link.category_id);
      if (!name) continue; // a link whose category is gone: nothing to show
      const list = linksByClass.get(link.word_class_id) ?? [];
      list.push(name);
      linksByClass.set(link.word_class_id, list);
    }

    const classes: DraftClass[] = classRows.map((row) => ({
      name: row.name,
      kind: row.kind,
      description: row.description ?? "",
      // Sorted so the order a collaborator's checkbox happened to be written in cannot
      // masquerade as a change on the next comparison.
      categories: (linksByClass.get(row.id) ?? []).sort(),
    }));

    const categories: DraftCategory[] = categoryRows.map((row) => ({
      name: row.name,
      description: row.description ?? "",
      values: valueRows
        .filter((v) => v.category_id === row.id)
        .map((v) => ({ value: v.value, notes: v.notes ?? "" })),
    }));

    return { classes, categories };
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const next = await read(projectId);
      if (next) adopt(next);
    } finally {
      loading.value = false;
    }
  }

  async function save(projectId: string) {
    const found = problems(draft.value);
    if (found.length) {
      error.value = found.join(" ");
      return false;
    }

    saving.value = true;
    error.value = null;
    try {
      const payload = {
        classes: draft.value.classes.map((c, i) => ({
          name: c.name.trim(),
          kind: c.kind,
          description: c.description.trim(),
          sort_order: i,
          categories: c.categories,
        })),
        categories: draft.value.categories.map((c, i) => ({
          name: c.name.trim(),
          description: c.description.trim(),
          sort_order: i,
          values: c.values.map((v, j) => ({
            value: v.value.trim(),
            notes: v.notes.trim(),
            sort_order: j,
          })),
        })),
      };

      const { error: rpcError } = await supabase.rpc("save_word_classes", {
        p_project_id: projectId,
        p_payload: payload,
      });
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }

      // Read back rather than assuming: the RPC normalises blanks to null and rewrites
      // sort_order from position.
      const next = await read(projectId);
      if (next) adopt(next);
      return true;
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    draft.value = cloneDraft(persisted.value);
    incoming = null;
    changedElsewhere.value = false;
  }

  function acceptIncoming() {
    if (incoming) adopt(incoming);
    else changedElsewhere.value = false;
  }

  // Editing ---------------------------------------------------------------------------

  function addClass(name = "") {
    draft.value.classes.push(emptyClass(name));
  }

  function removeClassAt(index: number) {
    draft.value.classes.splice(index, 1);
  }

  function moveClass(index: number, delta: number) {
    move(draft.value.classes, index, delta);
  }

  function addCategory(name = "") {
    draft.value.categories.push(emptyCategory(name));
  }

  /**
   * Removing a category also unlinks it from every class.
   *
   * Not left to cascade: the RPC *raises* on a class naming a category that is not in
   * the payload, so a draft that kept the link would fail to save with a message about
   * a missing row rather than the deletion the user actually made.
   */
  function removeCategoryAt(index: number) {
    const [removed] = draft.value.categories.splice(index, 1);
    if (!removed) return;
    for (const cls of draft.value.classes) {
      cls.categories = cls.categories.filter((name) => name !== removed.name);
    }
  }

  function moveCategory(index: number, delta: number) {
    move(draft.value.categories, index, delta);
  }

  /** Renaming a category has to carry its links with it, for the same reason. */
  function renameCategory(index: number, name: string) {
    const category = draft.value.categories[index];
    if (!category) return;
    const before = category.name;
    category.name = name;
    for (const cls of draft.value.classes) {
      cls.categories = cls.categories.map((n) => (n === before ? name : n));
    }
  }

  function toggleCategory(classIndex: number, name: string) {
    const cls = draft.value.classes[classIndex];
    if (!cls) return;
    cls.categories = cls.categories.includes(name)
      ? cls.categories.filter((n) => n !== name)
      : [...cls.categories, name].sort();
  }

  function addValue(categoryIndex: number) {
    draft.value.categories[categoryIndex]?.values.push({ value: "", notes: "" });
  }

  function removeValueAt(categoryIndex: number, valueIndex: number) {
    draft.value.categories[categoryIndex]?.values.splice(valueIndex, 1);
  }

  function move<T>(list: T[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    if (item !== undefined) list.splice(target, 0, item);
  }

  // Realtime: notify, never patch ------------------------------------------------------

  const unsubscribers: (() => void)[] = [];
  let subscribedTo: string | null = null;
  let compareTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * One save writes across four tables, so a burst of events is normal and counting them
   * proves nothing. Re-read and compare instead: if what is stored equals what we hold,
   * the events were our own echo.
   */
  function scheduleCompare(projectId: string) {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(() => {
      void (async () => {
        const next = await read(projectId);
        if (!next) return;
        if (canonicalDraft(next) === canonicalDraft(persisted.value)) return;
        incoming = next;
        changedElsewhere.value = true;
      })();
    }, 400);
  }

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    const notify = { onInsert: () => scheduleCompare(projectId) };
    const handlers = {
      ...notify,
      onUpdate: () => scheduleCompare(projectId),
      onDelete: () => scheduleCompare(projectId),
    };

    unsubscribers.push(
      subscribeToProjectTable<WordClass>("word_classes", projectId, handlers),
      subscribeToProjectTable<GrammaticalCategory>("grammatical_categories", projectId, handlers),
      subscribeToProjectTable<CategoryValue>("category_values", projectId, handlers),
      subscribeToProjectTable<ClassCategoryRow>("word_class_categories", projectId, handlers),
    );
  }

  function unsubscribeAll() {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = null;
    while (unsubscribers.length) unsubscribers.pop()?.();
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    persisted.value = emptyDraft();
    draft.value = emptyDraft();
    error.value = null;
    changedElsewhere.value = false;
    incoming = null;
  }

  return {
    draft,
    persisted,
    classCount,
    categoryCount,
    classNames,
    dirty,
    loading,
    saving,
    error,
    changedElsewhere,
    fetchFor,
    save,
    discard,
    acceptIncoming,
    addClass,
    removeClassAt,
    moveClass,
    addCategory,
    removeCategoryAt,
    moveCategory,
    renameCategory,
    toggleCategory,
    addValue,
    removeValueAt,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
