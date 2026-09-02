import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { Project } from "@/types/models";

export const useProjectsStore = defineStore("projects", () => {
  const auth = useAuthStore();

  // Keyed by id so realtime events and fetches converge on the same row rather than
  // appending a duplicate when the writer receives the echo of its own insert.
  const byId = ref<Map<string, Project>>(new Map());
  /**
   * Published projects, held **separately** from the user's own.
   *
   * Two maps rather than one filtered list, because since 0026 a plain
   * `select * from projects` returns every public project as well as the user's own —
   * RLS narrows to *visible*, which is a wider question than *mine*. Merging them would
   * put strangers' languages on someone's dashboard under "your projects".
   */
  const publicById = ref<Map<string, Project>>(new Map());
  const loading = ref(false);
  const loadingPublic = ref(false);
  const error = ref<string | null>(null);

  const projects = computed(() =>
    [...byId.value.values()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  /** Published projects the user is *not* already a member of — theirs are listed above. */
  const publicProjects = computed(() =>
    [...publicById.value.values()]
      .filter((p) => !byId.value.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  /**
   * Apply a realtime event, deciding which list the row belongs in.
   *
   * A **private** row can only have reached this client if they are a member — inserts and
   * updates are RLS-checked before delivery — so it goes straight into their own list, and
   * a project created in another tab still appears here. A **public** row proves nothing
   * either way, so it lands in the published list and only updates the user's own if it
   * was already there. Getting this backwards would put strangers' languages under "your
   * projects".
   */
  function upsert(row: Project) {
    if (!row.is_public) {
      publicById.value.delete(row.id);
      byId.value.set(row.id, row);
      return;
    }
    publicById.value.set(row.id, row);
    if (byId.value.has(row.id)) byId.value.set(row.id, row);
  }

  /** For rows this client knows are the user's own — a create, or a membership fetch. */
  function adopt(row: Project) {
    byId.value.set(row.id, row);
    if (row.is_public) publicById.value.set(row.id, row);
  }

  function remove(key: Partial<Project>) {
    // Only the primary key is present, and the event may be for a project we never
    // held — deletes arrive unfiltered and unauthorized.
    if (!key.id) return;
    byId.value.delete(key.id);
    publicById.value.delete(key.id);
  }

  /**
   * The user's own projects — the ones they are a member of.
   *
   * Narrowed by an explicit join on `project_members` rather than by RLS, which no longer
   * answers this question: since 0026 the read policy is "visible", and every published
   * project is visible to everyone. The membership rows are the authority on whose project
   * it is, and they are readable only to members, so this cannot over-return.
   */
  async function fetchAll() {
    if (!auth.user) {
      byId.value = new Map();
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data, error: queryError } = await supabase
        .from("projects")
        .select("*, project_members!inner(user_id)")
        .eq("project_members.user_id", auth.user.id)
        .order("name");

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      // The embedded membership is a filter, not data: drop it so the stored row is a
      // plain `Project` and nothing downstream has to know how it was narrowed.
      byId.value = new Map(
        (data ?? []).map(({ project_members: _members, ...row }) => [row.id, row as Project]),
      );
      for (const row of byId.value.values()) if (row.is_public) publicById.value.set(row.id, row);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Published projects, for the dashboard — the one query in the app with no user to
   * narrow it. It runs signed out, which is the point.
   */
  async function fetchPublic() {
    loadingPublic.value = true;
    try {
      const { data, error: queryError } = await supabase
        .from("projects")
        .select("*")
        .eq("is_public", true)
        .order("name");

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      publicById.value = new Map((data ?? []).map((row) => [row.id, row]));
    } finally {
      loadingPublic.value = false;
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
    if (data) adopt(data);
    return data;
  }

  function get(id: string) {
    return byId.value.get(id) ?? publicById.value.get(id) ?? null;
  }

  async function updateProject(
    id: string,
    patch: { name?: string; description?: string | null; is_public?: boolean },
  ) {
    error.value = null;
    const { data, error: updateError } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updateError) {
      error.value = updateError.message;
      return false;
    }
    // RLS restricts UPDATE to owners, and a blocked update is not an error — it simply
    // matches no rows and returns null. Say so rather than reporting a silent success.
    if (!data) {
      error.value = "Only the project owner can change this.";
      return false;
    }
    // `adopt`, not `upsert`: only an owner reaches this, so the row is theirs, and
    // unpublishing must not drop it out of their own list.
    adopt(data);
    if (!data.is_public) publicById.value.delete(data.id);
    return true;
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
    publicById.value = new Map();
    error.value = null;
  }

  return {
    projects,
    publicProjects,
    loading,
    loadingPublic,
    error,
    fetchAll,
    fetchPublic,
    createProject,
    updateProject,
    get,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
