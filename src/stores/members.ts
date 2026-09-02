import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { ProjectMember, ProjectMemberWithProfile } from "@/types/models";

// project_members has a composite primary key, so its rows have no `id` the realtime
// helper can key on. This is the stable identity for one membership.
const keyOf = (m: Pick<ProjectMember, "project_id" | "user_id">) => `${m.project_id}:${m.user_id}`;

export const useMembersStore = defineStore("members", () => {
  const byKey = ref<Map<string, ProjectMemberWithProfile>>(new Map());
  const loading = ref(false);
  const error = ref<string | null>(null);
  const adding = ref(false);

  const auth = useAuthStore();

  const members = computed(() =>
    [...byKey.value.values()].sort((a, b) => {
      // Owners first, then alphabetical, so the list doesn't reshuffle on every change.
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return (a.profile?.email ?? "").localeCompare(b.profile?.email ?? "");
    }),
  );

  /** The signed-in user's role in whichever project is currently loaded. */
  const currentRole = computed(
    () => members.value.find((m) => m.user_id === auth.user?.id)?.role ?? null,
  );
  const isOwner = computed(() => currentRole.value === "owner");

  /**
   * Whether this project has been looked up yet. `canEdit` is false before it has, and
   * the workspace waits for it, so a member never sees the page in read-only for a beat.
   */
  const loaded = ref(false);

  /**
   * May the signed-in user change anything here?
   *
   * Since 0026 a project can be **public**, and a public project is readable by anyone —
   * a non-member sees the whole workspace and must not be offered a control that RLS will
   * refuse. Membership is the answer to that question, and it is the same answer for a
   * signed-out visitor (no rows, no role) and for a signed-in stranger.
   *
   * This is a *presentation* decision, never a boundary. The boundary is RLS, and it
   * holds whatever this returns.
   */
  const canEdit = computed(() => loaded.value && currentRole.value !== null);

  async function fetchFor(projectId: string) {
    loading.value = true;
    // Cleared first: navigating to another project must not answer "can I edit?" from the
    // last one's membership while this one is in flight.
    loaded.value = false;
    error.value = null;
    try {
      const { data, error: queryError } = await supabase
        .from("project_members")
        .select("*, profile:profiles(id, email, display_name)")
        .eq("project_id", projectId);

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      byKey.value = new Map(
        (data ?? []).map((row) => [keyOf(row), row as ProjectMemberWithProfile]),
      );
      // Set even on the empty result, which is the ordinary case for a public project's
      // visitor: zero rows is an answer, not a failure.
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function addByEmail(projectId: string, email: string) {
    adding.value = true;
    error.value = null;
    try {
      const { error: rpcError } = await supabase.rpc("add_project_member", {
        p_project_id: projectId,
        p_email: email,
      });
      if (rpcError) {
        // The RPC raises a bare "no account for x@y" for an unknown email; the raw
        // Postgres message is the useful thing to show, so pass it through.
        error.value = rpcError.message;
        return false;
      }
      // The RPC returns the membership without the joined profile, so re-read rather
      // than inventing a half-populated row.
      await fetchFor(projectId);
      return true;
    } finally {
      adding.value = false;
    }
  }

  async function remove(projectId: string, userId: string) {
    error.value = null;
    const { error: deleteError } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (deleteError) {
      error.value = deleteError.message;
      return false;
    }
    byKey.value.delete(keyOf({ project_id: projectId, user_id: userId }));
    return true;
  }

  // One subscription per project, owned here rather than in the component.
  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribe = subscribeToProjectTable<ProjectMember>("project_members", projectId, {
      // A new membership arrives without its profile, so re-read to pick up the join.
      onInsert: () => void fetchFor(projectId),
      onUpdate: () => void fetchFor(projectId),
      // Deletes carry only the primary key, which here is project_id + user_id.
      // Drop it locally if it is ours; ignore the ones for other projects.
      onDelete: (key) => {
        if (key.project_id === projectId && key.user_id) {
          byKey.value.delete(keyOf({ project_id: projectId, user_id: key.user_id }));
        }
      },
    });
  }

  function unsubscribeAll() {
    unsubscribe?.();
    unsubscribe = null;
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    byKey.value = new Map();
    loaded.value = false;
    error.value = null;
  }

  return {
    members,
    currentRole,
    isOwner,
    canEdit,
    loaded,
    loading,
    adding,
    error,
    fetchFor,
    addByEmail,
    remove,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
