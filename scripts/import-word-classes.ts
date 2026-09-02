/**
 * Turn the harness repo's `grammar.yaml` into a JSON seed for the word-class section.
 *
 * Emits a file rather than writing to the database, for the same reasons as
 * `import-lexicon.ts`: the output is reviewable and diffable against upstream, and the
 * script needs no credentials. Load it with one call to `save_word_classes`.
 *
 * **Two sources, deliberately combined.** Upstream has no single list of word classes.
 * The open classes are only implicit — they are the distinct `pos` values on the 61
 * lexicon entries — and the closed ones are only the *keys* of the `closed_class` block,
 * which is a form inventory rather than a class list. Neither alone is the answer, and
 * `categories` is a third thing again (features, not classes), which is exactly the
 * mismatch that made this section hard to design.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../../xenolinguistics-harness/packages/own-conlang/grammar.yaml");
const OUT = resolve(here, "../supabase/seed/word-classes.json");

type Source = {
  categories?: Record<string, { values?: string[] }>;
  closed_class?: Record<string, unknown>;
  lexicon?: { pos?: string }[];
};

type SeedValue = { value: string; notes: string };
type SeedCategory = { name: string; description: string; values: SeedValue[] };
type SeedClass = {
  name: string;
  kind: "open" | "closed";
  description: string;
  categories: string[];
};

/**
 * `closed_class` key -> the class name a linguist would use.
 *
 * Written out rather than derived: `case` in that block is a *category*, and its members
 * are case markers; `numerals` is a class whose members are numerals. Guessing between
 * those two readings from the key alone is not possible, which is the point.
 */
const CLOSED: { key: string; name: string; description: string; categories: string[] }[] = [
  {
    key: "case",
    name: "case marker",
    description: "Occupies the case slot on a nominal.",
    categories: ["case"],
  },
  {
    key: "semantic_particles",
    name: "semantic particle",
    description: "Occupies the case slot instead of a case marker.",
    categories: ["semantic_particle"],
  },
  { key: "tense", name: "tense marker", description: "", categories: ["tense"] },
  { key: "force", name: "force marker", description: "", categories: ["force"] },
  {
    key: "evidential",
    name: "evidential",
    description: "A final coda rather than a full morpheme.",
    categories: ["evidential"],
  },
  {
    key: "relativizers",
    name: "relativizer",
    description: "All three do modifier duty; a modifier is a relativized predicate.",
    categories: ["tense"],
  },
  { key: "pronouns", name: "pronoun", description: "", categories: ["person", "number"] },
  { key: "deixis", name: "demonstrative", description: "", categories: ["deixis"] },
  { key: "particles", name: "particle", description: "", categories: [] },
  { key: "numerals", name: "numeral", description: "", categories: [] },
  {
    key: "classifier",
    name: "classifier",
    description: "One general classifier; the system is deferred upstream.",
    categories: [],
  },
  {
    key: "negation",
    name: "negation",
    description: "A prefix on the predicate word, with three allomorphs.",
    categories: [],
  },
];

/** Which categories each open class inflects for, from `morpheme_order`'s two templates. */
const OPEN_CATEGORIES: Record<string, string[]> = {
  noun: ["number", "case"],
  verb: ["tense", "force", "evidential"],
  predicate: ["tense", "force", "evidential"],
  adjective: [],
};

/**
 * Prose the source carries as YAML *comments*, which `parse` cannot see.
 *
 * Transcribed by hand because the alternative is losing it. `paucal` is not a spare label:
 * upstream says it is what reduplication means when no numeral and counter are present,
 * which is the difference between "some" and a plain plural.
 */
const CATEGORY_NOTES: Record<string, string> = {
  semantic_particle:
    "Occupies the case slot instead of a case marker; with the case cue gone the DP is expected in prototypical word order.",
};
const VALUE_NOTES: Record<string, Record<string, string>> = {
  number: { paucal: "reduplication without numeral+counter" },
  force: { declarative: "no form; see meta.missing upstream" },
};

const source = parse(readFileSync(SOURCE, "utf8")) as Source;

// sort_order is written out rather than left to the RPC's default of 0: this file is
// loaded straight into save_word_classes, and every row landing at 0 would make the
// read-back order arbitrary. The app supplies it from list position; a seed has to too.
const categories: SeedCategory[] = Object.entries(source.categories ?? {}).map(
  ([name, body], i) => ({
    name,
    description: CATEGORY_NOTES[name] ?? "",
    sort_order: i,
    values: (body?.values ?? []).map((value, j) => ({
      value,
      notes: VALUE_NOTES[name]?.[value] ?? "",
      sort_order: j,
    })),
  }),
);

// Open classes are the distinct `pos` values, in the order they first appear — which puts
// the copula first, as upstream lists it.
const seenPos: string[] = [];
for (const entry of source.lexicon ?? []) {
  if (entry.pos && !seenPos.includes(entry.pos)) seenPos.push(entry.pos);
}

const known = new Set(categories.map((c) => c.name));
/** A class may not name a category the source does not define; the RPC would reject it. */
const filter = (names: string[]) => names.filter((n) => known.has(n));

const openClasses = seenPos.sort().map((pos) => ({
  name: pos,
  kind: "open" as const,
  description: "",
  categories: filter(OPEN_CATEGORIES[pos] ?? []),
}));

const closedClasses = CLOSED.filter((c) => c.key in (source.closed_class ?? {})).map((c) => ({
  name: c.name,
  kind: "closed" as const,
  description: c.description,
  categories: filter(c.categories),
}));

// Open classes first, then closed — the order the page reads best in.
const classes: SeedClass[] = [...openClasses, ...closedClasses].map((c, i) => ({
  ...c,
  sort_order: i,
}));

const payload = { classes, categories };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  `Wrote ${payload.classes.length} classes (${openClasses.length} open, ${closedClasses.length} closed) ` +
    `and ${categories.length} categories to ${OUT}`,
);
