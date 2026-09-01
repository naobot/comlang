// Readable aliases over the generated schema in ./database.ts.
//
// Import from here rather than reaching into Database["public"]["Tables"][...] at every
// call site: when `pnpm gen:types` rewrites database.ts, only this file has to keep up.

import type { Enums, Tables } from "./database";

export type Project = Tables<"projects">;
export type ProjectMember = Tables<"project_members">;
export type ProjectRole = Enums<"project_role">;

export type Profile = Tables<"profiles">;

/** A membership joined to the person it belongs to, as the members list renders it. */
export type ProjectMemberWithProfile = ProjectMember & {
  profile: Pick<Profile, "id" | "email" | "display_name"> | null;
};
