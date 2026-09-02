// Readable aliases over the generated schema in ./database.ts.
//
// Import from here rather than reaching into Database["public"]["Tables"][...] at every
// call site: when `pnpm gen:types` rewrites database.ts, only this file has to keep up.

import type { CorpusKind as PureCorpusKind } from "@/lib/corpusImport";

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

/**
 * One dictionary entry.
 *
 * `word_class` is still **text, not a foreign key**, now that `word_classes` exists — 0014
 * expected it to become one, and 0012/0013 settled the opposite policy in the meantime.
 * A key would make deleting a class either delete the words in it or be blocked by them;
 * a dangling name lets the entry survive and be shown in red. See lib/wordClasses.ts.
 */
export type LexiconEntry = Tables<"lexicon_entries">;

/**
 * One corpus example: an English utterance beside its conlang counterpart, and nothing
 * else. Both columns are `not null default ''` rather than nullable — the editor is a
 * grid, where a cell is empty or it is not. See 0022.
 */
export type CorpusEntry = Tables<"corpus_entries">;

/**
 * Which sub-view an example is edited in — a passage or a single utterance (0025).
 *
 * The pure import module declares the same union locally, because its purity test forbids
 * it from importing anything outside `src/lib`. `_kindsAgree` below is what stops the two
 * drifting: it stops compiling if the enum and the literal type stop matching.
 */
export type CorpusKind = Enums<"corpus_kind">;

type Assert<T extends true> = T;
export type CorpusKindsAgree = Assert<
  [PureCorpusKind] extends [CorpusKind]
    ? [CorpusKind] extends [PureCorpusKind]
      ? true
      : false
    : false
>;

/**
 * One grammar rule. Every field but the name is free text this round; `rule_order` is
 * not — the source's rule_order is a feeding pipeline, not a display preference.
 */
export type GrammarRule = Tables<"grammar_rules">;

/**
 * Word classes and the inflectional categories they carry.
 *
 * `word_class_categories` is the join. Note there is deliberately no morpheme-order
 * table: see 0019 for the five places the source resists a slot model.
 */
export type WordClass = Tables<"word_classes">;
export type WordClassKind = Enums<"word_class_kind">;
export type GrammaticalCategory = Tables<"grammatical_categories">;
export type CategoryValue = Tables<"category_values">;
export type WordClassCategory = Tables<"word_class_categories">;

/** A membership joined to the person it belongs to, as the members list renders it. */
export type ProjectMemberWithProfile = ProjectMember & {
  profile: Pick<Profile, "id" | "email" | "display_name"> | null;
};
