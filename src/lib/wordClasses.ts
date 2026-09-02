/**
 * Word classes and the inflectional categories they carry — the pure part.
 *
 * No imports from `vue`, `pinia`, or the Supabase client, for the same reason
 * `phonotactics.ts` has none: the moment it reaches for the database it stops being
 * reusable and becomes this page's internals. `wordClasses.test.ts` asserts the import
 * list is empty rather than trusting this comment.
 *
 * **What this models and what it does not.** grammar.yaml states its classes and its
 * `categories` block outright, and that is what is here. It also has a `morpheme_order`
 * block, which is *not* — the obvious model (a class owns an ordered chain of slots) is
 * one the source resists in five places, and guessing at it would encode a structure
 * nobody has agreed to. See 0019 for the list.
 */

export type ClassKind = "open" | "closed";

export type DraftValue = { value: string; notes: string };

export type DraftCategory = {
  name: string;
  description: string;
  values: DraftValue[];
};

export type DraftClass = {
  name: string;
  kind: ClassKind;
  description: string;
  /** Category names, not ids — the payload refers to everything by its natural key. */
  categories: string[];
};

export type Draft = {
  classes: DraftClass[];
  categories: DraftCategory[];
};

export const emptyDraft = (): Draft => ({ classes: [], categories: [] });

export const emptyClass = (name = ""): DraftClass => ({
  name,
  kind: "open",
  description: "",
  categories: [],
});

export const emptyCategory = (name = ""): DraftCategory => ({
  name,
  description: "",
  values: [],
});

/**
 * **Not `structuredClone`.** A draft held in a `ref` is a reactive Proxy, and
 * `structuredClone` throws `DataCloneError` on one — the bug that silently killed every
 * phonotactics save. A JSON round-trip is exact for this plain-data shape.
 */
export function cloneDraft(draft: Draft): Draft {
  return JSON.parse(JSON.stringify(draft)) as Draft;
}

/**
 * Order-sensitive, unlike the phonotactics comparison.
 *
 * Class order here is presentation — nouns before pronouns reads better than alphabetical
 * — but it is still *stored*, so a reorder is a real change the user expects to persist,
 * and a comparison that ignored it would leave the Save button greyed out after one.
 * A class's own category list is sorted before comparing, because there ticking two boxes
 * in the other order is the same statement.
 */
export function canonicalDraft(draft: Draft): string {
  return JSON.stringify({
    classes: draft.classes.map((c) => ({
      name: c.name,
      kind: c.kind,
      description: c.description,
      categories: [...c.categories].sort(),
    })),
    categories: draft.categories.map((c) => ({
      name: c.name,
      description: c.description,
      values: c.values.map((v) => ({ value: v.value, notes: v.notes })),
    })),
  });
}

// Validation ---------------------------------------------------------------------------

/**
 * Everything wrong with a draft, as messages a person can act on.
 *
 * The database enforces all of this too, via `not null`, the check constraints and the
 * unique indexes — but a unique-violation message names a constraint, not the thing the
 * user typed. Returning a list rather than the first problem means fixing one does not
 * just reveal the next.
 */
export function problems(draft: Draft): string[] {
  const out: string[] = [];

  const classNames = draft.classes.map((c) => c.name.trim());
  if (classNames.some((n) => !n)) out.push("Every word class needs a name.");
  out.push(...duplicates(classNames).map((n) => `Two word classes are both called “${n}”.`));

  const categoryNames = draft.categories.map((c) => c.name.trim());
  if (categoryNames.some((n) => !n)) out.push("Every category needs a name.");
  out.push(...duplicates(categoryNames).map((n) => `Two categories are both called “${n}”.`));

  for (const category of draft.categories) {
    const values = category.values.map((v) => v.value.trim());
    const name = category.name.trim() || "a category";
    if (values.some((v) => !v)) out.push(`A value of “${name}” is blank.`);
    out.push(...duplicates(values).map((v) => `“${name}” lists “${v}” twice.`));
  }

  // A link to a category that is not in the draft would be rejected by the RPC, which
  // raises rather than dropping it silently. Catching it here says which class is at
  // fault; the RPC's message cannot, because by then it is just a missing row.
  const known = new Set(categoryNames);
  for (const cls of draft.classes) {
    for (const category of cls.categories) {
      if (!known.has(category)) {
        out.push(
          `“${cls.name.trim() || "A class"}” inflects for “${category}”, which no longer exists.`,
        );
      }
    }
  }

  return out;
}

function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    if (seen.has(name)) dupes.add(name);
    seen.add(name);
  }
  return [...dupes];
}

// Cross-references to the lexicon --------------------------------------------------------

/**
 * How many lexicon entries sit in each class, keyed by class name.
 *
 * Counted from the entries rather than stored on the class: the count is a fact about the
 * lexicon, and a stored copy would be wrong the moment anyone added a word.
 */
export function entryCounts(
  entries: readonly { word_class: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const name = entry.word_class?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Class names used by lexicon entries that no class defines, with how many entries use
 * each.
 *
 * `lexicon_entries.word_class` is **text, not a foreign key**, and stays that way now
 * that this table exists — the same decision as 0012 and 0013 for phonotactic rules and
 * class membership. A foreign key would make deleting a class either delete the words in
 * it or be blocked by them; storing the name lets the reference dangle, so the entry
 * survives and the UI can show it in red. A dangling reference is the thing that makes
 * the word recoverable.
 */
export function orphanedClassNames(
  entries: readonly { word_class: string | null }[],
  draft: Draft,
): { name: string; count: number }[] {
  const known = new Set(draft.classes.map((c) => c.name.trim()));
  return [...entryCounts(entries)]
    .filter(([name]) => !known.has(name))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The categories a class inflects for, resolved to the category objects themselves. */
export function categoriesOf(cls: DraftClass, draft: Draft): DraftCategory[] {
  const byName = new Map(draft.categories.map((c) => [c.name.trim(), c]));
  return cls.categories.map((name) => byName.get(name)).filter((c): c is DraftCategory => !!c);
}
