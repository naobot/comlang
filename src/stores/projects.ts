import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/types/models";

export const useProjectsStore = defineStore("projects", () => {
  // Keyed by id so realtime events and fetches converge on the same row rather than
  // appending a duplicate when the writer receives the echo of its own insert.
  const byId = ref<Map<string, Project>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);

  const projects = computed(() =>
    [...byId.value.values()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  function upsert(row: Project) {
    byId.value.set(row.id, row);
  }

  function remove(key: Partial<Project>) {
    // Only the primary key is present, and the event may be for a project we never
    // held — deletes arrive unfiltered and unauthorized.
    if (key.id) byId.value.delete(key.id);
  }

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      // RLS narrows this to projects the user is a member of; a non-member simply gets
      // no rows back rather than an error.
      const { data, error: queryError } = await supabase.from("projects").select("*").order("name");

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      byId.value = new Map((data ?? []).map((row) => [row.id, row]));
    } finally {
      loading.value = false;
    }
  }

  async function createProject(name: string, description?: string) {
    error.value = null;
    // Goes through the RPC, not a plain insert: projects has no INSERT policy, because
    // the project and its owner membership have to be written in one transaction.
    //
    // p_description is an optional arg with a SQL default, so it must be omitted rather
    // than passed as null — the generated Args type is `p_description?: string`.
    const { data, error: rpcError } = await supabase.rpc("create_project", {
      p_name: name,
      ...(description ? { p_description: description } : {}),
    });

    if (rpcError) {
      error.value = rpcError.message;
      return null;
    }
    if (data) upsert(data);
    return data;
  }

  function get(id: string) {
    return byId.value.get(id) ?? null;
  }

  // The store owns the subscription, not the components — so the dashboard and the
  // workspace header read the same rows without opening two channels.
  //
  // No filter: `projects` has no project_id, and Postgres Changes cannot express
  // "rows I am a member of". RLS already limits which INSERT/UPDATE events reach us.
  let unsubscribe: (() => void) | null = null;

  function subscribe() {
    if (unsubscribe) return;
    unsubscribe = subscribeToTable<Project>("projects", null, {
      onInsert: upsert,
      onUpdate: upsert,
      onDelete: remove,
    });
  }

  function unsubscribeAll() {
    unsubscribe?.();
    unsubscribe = null;
  }

  function reset() {
    unsubscribeAll();
    byId.value = new Map();
    error.value = null;
  }

  return {
    projects,
    loading,
    error,
    fetchAll,
    createProject,
    get,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
