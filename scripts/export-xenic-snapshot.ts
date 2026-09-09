/**
 * Turn a committed raw dump of the live `xenic` comlang project into the flat files the
 * xenolinguistics harness consumes: a `grammar.yaml`-shaped document and the lexicon /
 * corpus CSVs.
 *
 * Reads a dump rather than the database on purpose — same reasoning as `import-lexicon.ts`:
 * the input is reviewable and diffable, and the script needs no credentials. The dump under
 * `exports/xenic-<date>/raw/` is produced out-of-band (Supabase MCP / SQL editor) and
 * committed; this script is the deterministic transform from it.
 *
 * Re-runnable: drop a fresh `raw/` dump next to a new dated folder and point DATE at it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type ExportInput,
  toCorpusCsv,
  toGrammarYaml,
  toLexiconCsv,
  toLexiconCsvFull,
} from "../src/lib/exporters";
import { parseSpec } from "../src/lib/morphologySpec";

const DATE = "2026-09-10";
const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, `../exports/xenic-${DATE}`);
const RAW = resolve(DIR, "raw");

const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(RAW, name), "utf8"));

type StructuralDump = {
  snapshot_at: string;
  phonemes: { ipa: string; kind: "consonant" | "vowel" }[];
  phoneme_classes: { symbol: string; label: string | null; members: string[] | null }[];
  syllable_templates: { name: string; weight: number; notes: string | null }[];
  syllable_slots: {
    slot_index: number;
    role: string;
    optional: boolean;
    class_symbol: string;
    phoneme_ipa: string[] | null;
  }[];
  phonotactic_constraints: {
    kind: string;
    role: string | null;
    seq_position: string | null;
    a_class_symbol: string | null;
    a_phoneme_ipa: string | null;
    b_class_symbol: string | null;
    b_phoneme_ipa: string | null;
    note: string | null;
  }[];
  grammar_rules:
    | { name: string; effect: string | null; environment: string | null; examples: string | null; notes: string | null }[]
    | null;
  word_classes: { name: string; kind: string; description: string | null; categories: string[] | null }[];
  categories: {
    name: string;
    description: string | null;
    values: { value: string; notes: string | null }[] | null;
  }[];
  graphemes: { phoneme_ipa: string; grapheme: string }[];
  orthography_rules: { name: string; rule_order: number; effect: string | null; examples: string | null }[];
  morphology_spec: unknown;
  corpus: { english: string; conlang: string; kind: string }[];
};

type LexiconRow = {
  entry_key: string | null;
  lemma: string;
  underlying_phonology: string | null;
  gloss: string | null;
  word_class: string | null;
  notes: string | null;
};

const s = readJson("structural.json") as StructuralDump;
const lexicon = readJson("lexicon.json") as LexiconRow[];

const { doc: morphology, problems } = parseSpec(s.morphology_spec);
if (problems.length) {
  console.warn(`morphology spec has ${problems.length} problem(s):`);
  for (const p of problems) console.warn(`  - ${p}`);
}

const input: ExportInput = {
  projectName: "xenic",
  generatedAt: new Date(s.snapshot_at),
  phonemes: s.phonemes,
  classes: s.phoneme_classes.map((c) => ({
    symbol: c.symbol,
    label: c.label,
    phoneme_ipa: c.members ?? [],
  })),
  templates: s.syllable_templates.map((t) => ({
    name: t.name,
    weight: t.weight,
    slots: [...s.syllable_slots]
      .sort((a, b) => a.slot_index - b.slot_index)
      .map((slot) => ({
        role: slot.role,
        optional: slot.optional,
        class_symbol: slot.class_symbol,
        phoneme_ipa: slot.phoneme_ipa,
      })),
  })),
  constraints: s.phonotactic_constraints.map((c) => ({
    kind: c.kind,
    role: c.role,
    seq_position: c.seq_position,
    a_class_symbol: c.a_class_symbol,
    a_phoneme_ipa: c.a_phoneme_ipa,
    b_class_symbol: c.b_class_symbol,
    b_phoneme_ipa: c.b_phoneme_ipa,
  })),
  lexicon: lexicon.map((e) => ({
    entry_key: e.entry_key,
    lemma: e.lemma,
    underlying: e.underlying_phonology,
    gloss: e.gloss,
    word_class: e.word_class,
    notes: e.notes,
  })),
  rules: (s.grammar_rules ?? []).map((r) => ({
    name: r.name,
    effect: r.effect ?? "",
    environment: r.environment ?? "",
    examples: r.examples ?? "",
    notes: r.notes ?? "",
  })),
  wordClasses: s.word_classes.map((c) => ({
    name: c.name,
    kind: c.kind,
    description: c.description ?? "",
    categories: c.categories ?? [],
  })),
  categories: s.categories.map((c) => ({
    name: c.name,
    description: c.description ?? "",
    values: (c.values ?? []).map((v) => ({ value: v.value, notes: v.notes ?? "" })),
  })),
  corpus: s.corpus.map((e) => ({ english: e.english, conlang: e.conlang })),
  graphemes: s.graphemes,
  orthographyRules: [...s.orthography_rules]
    .sort((a, b) => a.rule_order - b.rule_order)
    .map((r) => ({ name: r.name, effect: r.effect ?? "", examples: r.examples ?? "" })),
  morphology,
};

mkdirSync(DIR, { recursive: true });
const write = (name: string, contents: string) => {
  writeFileSync(resolve(DIR, name), contents);
  console.log(`  ${name}  (${contents.length} bytes)`);
};

write("xenic-grammar.yaml", toGrammarYaml(input));
write("xenic-lexicon.csv", toLexiconCsv(input));
write("xenic-lexicon-full.csv", toLexiconCsvFull(input));
write("xenic-corpus.csv", toCorpusCsv(input));

console.log(
  `\n${input.lexicon.length} lexicon entries, ${input.corpus.length} corpus rows, ` +
    `${input.phonemes.length} phonemes, ${input.graphemes.length} graphemes, ` +
    `${input.orthographyRules.length} orthography rules, ` +
    `morphology ${morphology ? "present" : "absent"} -> ${DIR}`,
);
