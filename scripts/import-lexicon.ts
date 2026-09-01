/**
 * Turn the harness repo's `grammar.yaml` lexicon into a JSON seed for `lexicon_entries`.
 *
 * Emits a file rather than writing to the database on purpose: the output is reviewable
 * and diffable against upstream, and the script needs no credentials. Load it once with
 * the Supabase SQL editor or MCP tools — see CLAUDE.md.
 *
 * Re-runnable. When the schema tightens, change the mapping here and regenerate.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../../xenolinguistics-harness/packages/own-conlang/grammar.yaml");
const OUT = resolve(here, "../supabase/seed/lexicon.json");

type SourceEntry = {
  key?: string;
  lemma?: string;
  pos?: string;
  gloss?: string;
  compound_of?: string[];
  lexicalised?: boolean;
};

type SeedEntry = {
  entry_key: string | null;
  lemma: string;
  gloss: string | null;
  word_class: string | null;
  notes: string | null;
};

/**
 * `compound_of` and `lexicalised` have no columns, because a compound is a real relation
 * that deserves a real one and this round is deliberately not deciding that. Folding them
 * into prose keeps the fact without pretending to model it.
 */
function notesFor(entry: SourceEntry): string | null {
  const parts: string[] = [];
  if (entry.compound_of?.length) {
    parts.push(`Compound of ${entry.compound_of.join(" + ")}.`);
  }
  if (entry.lexicalised) {
    parts.push("Lexicalised: stored as-is, phonological rules are not re-applied.");
  }
  return parts.length ? parts.join(" ") : null;
}

const doc = parse(readFileSync(SOURCE, "utf8")) as { lexicon?: SourceEntry[] };
const source = doc.lexicon ?? [];

const entries: SeedEntry[] = source.flatMap((entry) => {
  if (!entry.lemma) {
    console.warn(`skipping an entry with no lemma: ${JSON.stringify(entry)}`);
    return [];
  }
  return [
    {
      entry_key: entry.key ?? null,
      lemma: entry.lemma,
      gloss: entry.gloss ?? null,
      word_class: entry.pos ?? null,
      notes: notesFor(entry),
    },
  ];
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);

const byClass = new Map<string, number>();
for (const e of entries)
  byClass.set(e.word_class ?? "(none)", (byClass.get(e.word_class ?? "(none)") ?? 0) + 1);

console.log(`${entries.length} entries -> ${OUT}`);
console.log([...byClass].map(([k, n]) => `  ${n} ${k}`).join("\n"));
console.log(`  ${entries.filter((e) => e.notes).length} with notes (compounds)`);
