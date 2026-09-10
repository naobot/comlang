/**
 * Orthography: which character(s) represent each phoneme, and free-form spelling rules.
 *
 * Pure, like `phonotactics.ts` — no imports from `vue`, `pinia`, or `@/lib/supabase`. A
 * future exporter or word-generator feature reads this unchanged; the moment it reaches
 * for the database it stops being reusable and becomes this page's internals.
 * `orthography.test.ts` asserts the import list is empty rather than trusting this comment.
 */

// The stored shape ------------------------------------------------------------------
//
// These mirror what `save_orthography` takes and what the store holds. Live here rather
// than in the store because they are plain data with no I/O.

/**
 * One phoneme's spelling. Referenced by `phoneme_ipa`, text rather than a foreign key to
 * `phonemes` — the same "store the symbol, flag the orphan" decision phonotactics made for
 * class and slot membership (0012/0013), so deleting a phoneme from the inventory does not
 * silently erase a curated spelling choice. A digraph like "ng" is just a multi-character
 * `grapheme` string; no separate modelling is needed for it.
 */
export type DraftGrapheme = { phoneme_ipa: string; grapheme: string };

/**
 * One spelling rule, free text apart from `name` and its position in the list.
 *
 * 0031 copied `grammar_rules`' shape wholesale (`effect`/`environment`/`examples`/
 * `notes`); 0034 dropped `environment` and `notes` once every rule written in practice
 * turned out to state its environment as part of one prose sentence anyway ("as the onset
 * of a word's first syllable"), so the split was two boxes for one idea rather than real
 * structure. `examples` stays, meant to be filled from real lexicon spellings. Order is
 * kept because it may be a pipeline the same way grammar rules are.
 *
 * `summary` (0036) is the one addition since, and it is not `environment` returning.
 * `effect` teaches a reader: it hedges, gives context, and points at neighbouring rules.
 * `summary` states the rule as a rule, in one sentence, so that a consumer of the export
 * has something to check an implementation against. Both are optional and free text; a
 * rule with only `effect` is exactly as valid as it was before.
 */
export type DraftRule = {
  name: string;
  summary: string;
  effect: string;
  examples: string;
};

export type Draft = {
  graphemes: DraftGrapheme[];
  rules: DraftRule[];
};

/**
 * Deep copy of a draft.
 *
 * **Not `structuredClone`.** A draft held in a Vue `ref` is a reactive Proxy, and
 * `structuredClone` throws `DataCloneError` on one — a documented failure mode elsewhere in
 * this app (phonotactics) that silently killed every save. A JSON round-trip is exact here
 * because a Draft is only strings.
 */
export function cloneDraft(draft: Draft): Draft {
  return JSON.parse(JSON.stringify(draft)) as Draft;
}

/**
 * A stable string for comparing two drafts, used for both the dirty check and for telling
 * a collaborator's save apart from the echo of our own.
 *
 * Graphemes are order-insensitive — the mapping's display order is the phoneme chart
 * order, not a user choice, so re-sorting it must not read as a change. Rules are
 * order-**sensitive**, the same asymmetry `phonotactics.ts` has between its templates and
 * slots: a rule's position may carry meaning the same way a grammar rule's does.
 */
export function canonicalDraft(draft: Draft): string {
  return JSON.stringify({
    graphemes: [...draft.graphemes].sort((a, b) => a.phoneme_ipa.localeCompare(b.phoneme_ipa)),
    rules: draft.rules,
  });
}

/**
 * Rule names that occur more than once, trimmed and compared as the RPC will compare them.
 * Blank is not counted here — it is its own problem, reported separately.
 *
 * This is what stands between two same-named rules and a silent merge: `save_orthography`
 * upserts rules on `(project_id, name)`, so a duplicate is not an error there, it is one
 * row where the user wrote two. Same trap `duplicateTemplateNames` catches for phonotactics.
 */
export function duplicateRuleNames(draft: Draft): string[] {
  const seen = new Map<string, number>();
  for (const rule of draft.rules) {
    const name = rule.name.trim();
    if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([name]) => name);
}

/**
 * Everything wrong with the draft, in messages a user can act on — *every* problem rather
 * than the first, so fixing one does not just reveal the next.
 */
export function draftProblems(draft: Draft): string[] {
  const found: string[] = [];
  if (draft.rules.some((r) => !r.name.trim())) {
    found.push("Every rule needs a name.");
  }
  const duplicates = duplicateRuleNames(draft);
  if (duplicates.length) {
    found.push(`Two rules are called ${duplicates.map((n) => `"${n}"`).join(", ")}.`);
  }
  return found;
}

/**
 * Graphemes naming a phoneme the inventory no longer has.
 *
 * The database cannot answer this — `phoneme_ipa` is plain text rather than a foreign key,
 * precisely so that removing a segment leaves the spelling standing instead of cascading it
 * away. The cost of keeping it is that the dangling reference has to be found here, the
 * same trade `orphanedMembers` makes for phonotactics.
 */
export function orphanedGraphemes(draft: Draft, inventory: ReadonlySet<string>): DraftGrapheme[] {
  return draft.graphemes.filter((g) => !inventory.has(g.phoneme_ipa));
}

/**
 * Inventory phonemes with no grapheme yet — informational, not an error: a new language's
 * orthography starts out incomplete, and that is a normal working state rather than
 * something to warn about the way an orphan is.
 */
export function unmappedPhonemes(draft: Draft, inventory: readonly string[]): string[] {
  const mapped = new Set(draft.graphemes.map((g) => g.phoneme_ipa));
  return inventory.filter((ipa) => !mapped.has(ipa));
}
