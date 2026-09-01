import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export type RowHandlers<T> = {
  onInsert: (row: T) => void;
  onUpdate: (row: T) => void;
  /**
   * Receives the deleted row's PRIMARY KEY ONLY, off a stream that is NOT filtered.
   *
   * Three Postgres Changes behaviours combine here:
   *   - DELETE events ignore the subscription filter entirely, so rows outside the
   *     filter arrive too.
   *   - RLS is not applied to DELETE, so there is no authorization check either.
   *   - Under RLS the `old` record carries only the primary key — every other column
   *     is absent, whatever `replica identity full` suggests.
   *
   * So this is a partial row, not a T: for `projects` that is `{ id }`, and for a
   * composite key like `project_members` it is `{ project_id, user_id }` with no `id`
   * at all. Implement it as "drop this if I hold it"; an unrecognised key is normal.
   */
  onDelete: (key: Partial<T>) => void;
};

type Entry = { channel: RealtimeChannel; refs: number };

// Keyed by channel name. The same row can be displayed in several places at once (a
// lexicon entry in a list and inside a grammar rule that references it); those must
// share one channel rather than opening one each and double-applying every event.
const channels = new Map<string, Entry>();

/**
 * Subscribe to row changes on one table.
 *
 * `filter` is a PostgREST-style predicate (e.g. `project_id=eq.<uuid>`) applied to
 * INSERT and UPDATE only. Pass null for tables that have no project_id of their own —
 * `projects` itself — where RLS is what scopes the insert/update stream instead.
 *
 * Returns an unsubscribe function. Channels are reference-counted, so callers may
 * subscribe freely and must release exactly once.
 */
export function subscribeToTable<T extends object>(
  table: string,
  filter: string | null,
  handlers: RowHandlers<T>,
): () => void {
  const key = filter ? `${table}:${filter}` : table;
  const existing = channels.get(key);

  if (existing) {
    existing.refs += 1;
    return () => release(key);
  }

  const scope = { schema: "public", table, ...(filter ? { filter } : {}) };

  const channel = supabase
    .channel(key)
    .on("postgres_changes", { event: "INSERT", ...scope }, (payload) =>
      handlers.onInsert(payload.new as T),
    )
    .on("postgres_changes", { event: "UPDATE", ...scope }, (payload) =>
      handlers.onUpdate(payload.new as T),
    )
    .on(
      // Deliberately unfiltered: a filter would be ignored for deletes anyway, and
      // passing one invites the reader to believe these are scoped. They are not.
      "postgres_changes",
      { event: "DELETE", schema: "public", table },
      (payload) => handlers.onDelete(payload.old as Partial<T>),
    )
    .subscribe();

  channels.set(key, { channel, refs: 1 });
  return () => release(key);
}

/** Convenience wrapper for the many tables that hang off a project_id. */
export function subscribeToProjectTable<T extends object>(
  table: string,
  projectId: string,
  handlers: RowHandlers<T>,
): () => void {
  return subscribeToTable(table, `project_id=eq.${projectId}`, handlers);
}

function release(key: string) {
  const entry = channels.get(key);
  if (!entry) return;

  entry.refs -= 1;
  if (entry.refs > 0) return;

  channels.delete(key);
  void supabase.removeChannel(entry.channel);
}

/** Drop every subscription. Call on sign-out: the old session's channels are dead. */
export function closeAllProjectChannels() {
  for (const [key, entry] of channels) {
    channels.delete(key);
    void supabase.removeChannel(entry.channel);
  }
}
