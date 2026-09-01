// Readable aliases over the generated schema in ./database.ts.
//
// Import from here rather than reaching into Database["public"]["Tables"][...] at every
// call site: when `pnpm gen:types` rewrites database.ts, only this file has to keep up.

import type { Enums, Tables } from "./database";

export type Project = Tables<"projects">;
export type ProjectMember = Tables<"project_members">;
export type ProjectRole = Enums<"project_role">;

export type Profile = Tables<"profiles">;

/** One segment in a project's phoneme inventory. Symbol and kind only — see 0008. */
export type Phoneme = Tables<"phonemes">;
export type PhonemeKind = Enums<"phoneme_kind">;

/** Phonotactics: named segment classes, syllable templates, and their constraints. */
export type PhonemeClass = Tables<"phoneme_classes">;
export type PhonemeClassMember = Tables<"phoneme_class_members">;
export type SyllableTemplate = Tables<"syllable_templates">;
export type SyllableSlot = Tables<"syllable_slots">;
export type PhonotacticConstraint = Tables<"phonotactic_constraints">;
export type SlotRole = Enums<"slot_role">;
export type ConstraintKind = Enums<"constraint_kind">;
export type SequencePosition = Enums<"sequence_position">;

/** A membership joined to the person it belongs to, as the members list renders it. */
export type ProjectMemberWithProfile = ProjectMember & {
  profile: Pick<Profile, "id" | "email" | "display_name"> | null;
};
