import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export type RowHandlers<T> = {
  onInsert: (row: T) => void;
  onUpdate: (row: T) => void;
  /**
   * Receives a bare primary key, off a stream that is NOT filtered.
   *
   * Two Postgres Changes behaviours combine here:
   *   - DELETE events ignore the subscription filter entirely, so ids for rows outside
   *     the filter arrive too.
   *   - RLS is not applied to DELETE, and under RLS the `old` record carries only the
   *     primary key, so there is nothing else to check the id against.
   *
   * Implement it as "drop this id if I hold it". An unknown id is normal, not an error.
   */
  onDelete: (id: string) => void;
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
export function subscribeToTable<T extends { id: string }>(
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
      (payload) => {
        const id = (payload.old as Partial<T>).id;
        if (id) handlers.onDelete(id);
      },
    )
    .subscribe();

  channels.set(key, { channel, refs: 1 });
  return () => release(key);
}

/** Convenience wrapper for the many tables that hang off a project_id. */
export function subscribeToProjectTable<T extends { id: string }>(
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
