/**
 * Export the project as the flat files it replaced: a `grammar.yaml`-shaped document and
 * a headerless `key,form` CSV.
 *
 * Pure, like `phonotactics.ts` — no Vue, no Supabase. The header calls it, and anything
 * else that wants a dump (a backup job, a round-trip test) can call the same functions.
 *
 * **YAML is emitted by hand rather than with a library.** The `yaml` package is a
 * devDependency used by the import script and must not reach the browser bundle, and
 * writing it out gives control over matching the source document's shape.
 *
 * What is deliberately absent: `alignment`, `morpheme_order`, `closed_class`, `exceptions`
 * and `samples`. The app has no data for any of them — morpheme order in particular is
 * still an open design question — and inventing empty keys would make the export look like
 * a complete grammar when it is a partial one.
 */

import { csvField } from "./csv";

export type ExportPhoneme = { ipa: string; kind: "consonant" | "vowel" };
export type ExportClass = { symbol: string; label: string | null; phoneme_ipa: string[] };
export type ExportSlot = {
  role: string;
  optional: boolean;
  class_symbol: string;
  /** The slot's own segments, or null when it takes the whole class. */
  phoneme_ipa: string[] | null;
};
export type ExportTemplate = { name: string; weight: number; slots: ExportSlot[] };
export type ExportConstraint = {
  kind: string;
  role: string | null;
  seq_position: string | null;
  a_class_symbol: string | null;
  a_phoneme_ipa: string | null;
  b_class_symbol: string | null;
  b_phoneme_ipa: string | null;
};
export type ExportEntry = {
  entry_key: string | null;
  lemma: string;
  gloss: string | null;
  word_class: string | null;
  notes: string | null;
};
export type ExportWordClass = {
  name: string;
  kind: string;
  description: string;
  categories: string[];
};
export type ExportCategory = {
  name: string;
  description: string;
  values: { value: string; notes: string }[];
};
/** One corpus example: two columns of prose and nothing else. See 0022. */
export type ExportCorpusEntry = { english: string; conlang: string };

export type ExportRule = {
  name: string;
  effect: string;
  environment: string;
  examples: string;
  notes: string;
};

export type ExportInput = {
  projectName: string;
  generatedAt: Date;
  phonemes: ExportPhoneme[];
  classes: ExportClass[];
  templates: ExportTemplate[];
  constraints: ExportConstraint[];
  lexicon: ExportEntry[];
  rules: ExportRule[];
  wordClasses: ExportWordClass[];
  categories: ExportCategory[];
  corpus: ExportCorpusEntry[];
};

// YAML scalars ------------------------------------------------------------------------

/** Characters that make a bare scalar ambiguous, plus anything YAML would coerce. */
const NEEDS_QUOTES = /^$|^[-?:,[\]{}#&*!|>'"%@`]|[:#]\s|[\s]$|^(?:true|false|null|~|\d)$/i;

/**
 * Inside `{...}` or `[...]` a comma is a separator, not text. A gloss like
 * "exist, there is" emitted bare there parses *without error* into a mangled mapping with
 * a spurious `there is:` key — silent corruption, which is worse than a parse failure.
 */
const NEEDS_QUOTES_IN_FLOW = /[,[\]{}]/;

const quote = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

/**
 * A YAML scalar, quoted only when it has to be.
 *
 * IPA is the reason the leading-character check matters: `ŋ` is safe bare, but `ʔo` starts
 * with a glottal stop that some parsers read as punctuation, and the source document
 * quotes those too.
 *
 * Pass `flow` for anything going inside `{...}` or `[...]`, where the rules are stricter.
 */
export function yamlScalar(value: string, flow = false): string {
  if (value.includes("\n")) return quote(value);
  if (NEEDS_QUOTES.test(value) || /^[ʔʼ]/.test(value)) return quote(value);
  if (flow && NEEDS_QUOTES_IN_FLOW.test(value)) return quote(value);
  return value;
}

const list = (values: string[]) => `[${values.map((v) => yamlScalar(v, true)).join(", ")}]`;

/** ISO date without the time-of-day noise, matching how the source dates its notes. */
const isoDate = (at: Date) => at.toISOString().slice(0, 10);

// grammar.yaml -------------------------------------------------------------------------

export function toGrammarYaml(input: ExportInput): string {
  const out: string[] = [];
  const push = (line = "") => out.push(line);

  push(`# Exported from comlang on ${isoDate(input.generatedAt)}.`);
  push("#");
  push("# A partial grammar: it carries only what the app currently models. Absent by");
  push("# design rather than by omission — categories, alignment, morpheme_order,");
  push("# closed_class, exceptions and samples have no home in the app yet.");
  push("");
  push("meta:");
  push(`  name: ${yamlScalar(input.projectName)}`);
  push(`  exported_at: ${isoDate(input.generatedAt)}`);
  push("  source: comlang");
  push("");

  // phonology -------------------------------------------------------------------------
  push("phonology:");
  const vowels = input.phonemes.filter((p) => p.kind === "vowel").map((p) => p.ipa);
  const consonants = input.phonemes.filter((p) => p.kind === "consonant").map((p) => p.ipa);
  push(`  consonants: ${list(consonants)}`);
  push(`  vowels: ${list(vowels)}`);

  if (input.classes.length) {
    push("  classes:");
    for (const cls of input.classes) {
      // The class's own members, including any the inventory has since lost — the export
      // is a record of what is stored, not of what currently resolves.
      push(`    ${yamlScalar(cls.symbol)}:`);
      if (cls.label) push(`      label: ${yamlScalar(cls.label)}`);
      push(`      members: ${list(cls.phoneme_ipa)}`);
    }
  }
  push("");

  // phonotactics ----------------------------------------------------------------------
  if (input.templates.length || input.constraints.length) {
    push("phonotactics:");
    if (input.templates.length) {
      push("  syllable_templates:");
      for (const template of input.templates) {
        push(`    - name: ${yamlScalar(template.name)}`);
        push(`      notation: ${yamlScalar(notation(template))}`);
        push(`      weight: ${template.weight}`);
        push("      slots:");
        for (const slot of template.slots) {
          // A restricted slot has to carry its segments, or the archive describes a
          // grammar that is not the one being generated. Flow context: every scalar in
          // here goes through yamlScalar's `flow` flag, since a bare comma inside {...}
          // is a separator and silently reshapes the mapping.
          const phonemes =
            slot.phoneme_ipa === null
              ? ""
              : `, phonemes: [${slot.phoneme_ipa.map((ipa) => yamlScalar(ipa, true)).join(", ")}]`;
          push(
            `        - { class: ${yamlScalar(slot.class_symbol, true)}, role: ${slot.role}, optional: ${slot.optional}${phonemes} }`,
          );
        }
      }
    }
    if (input.constraints.length) {
      push("  constraints:");
      for (const c of input.constraints) push(`    - ${yamlScalar(describeConstraint(c))}`);
    }
    push("");
  }

  // word classes and categories -------------------------------------------------------
  if (input.wordClasses.length) {
    push("word_classes:");
    for (const cls of input.wordClasses) {
      push(`  ${yamlScalar(cls.name)}:`);
      push(`    kind: ${cls.kind}`);
      if (cls.description) push(`    description: ${yamlScalar(cls.description)}`);
      if (cls.categories.length) push(`    inflects_for: ${list(cls.categories)}`);
    }
    push("");
  }

  // Emitted under the source's own key, and shaped like it: a mapping of category name to
  // its values, so a consumer of grammar.yaml reads this without a special case.
  if (input.categories.length) {
    push("categories:");
    for (const category of input.categories) {
      push(`  ${yamlScalar(category.name)}:`);
      push(`    values: ${list(category.values.map((v) => v.value))}`);
      if (category.description) push(`    description: ${yamlScalar(category.description)}`);
      for (const value of category.values) {
        if (value.notes) push(`    # ${value.value}: ${value.notes.replace(/\n+/g, " ")}`);
      }
    }
    push("");
  }

  // rules -----------------------------------------------------------------------------
  if (input.rules.length) {
    // Order is the pipeline, so it is emitted as an explicit list as well as by position
    // — the source's `rule_order` is what a consumer reads first.
    push(`rule_order: ${list(input.rules.map((r) => r.name))}`);
    push("");
    push("rules:");
    for (const rule of input.rules) {
      push(`  ${yamlScalar(rule.name)}:`);
      for (const [key, value] of [
        ["effect", rule.effect],
        ["environment", rule.environment],
        ["examples", rule.examples],
        ["note", rule.notes],
      ] as const) {
        if (value.trim()) push(`    ${key}: ${yamlScalar(value.trim())}`);
      }
    }
    push("");
  }

  // lexicon ---------------------------------------------------------------------------
  if (input.lexicon.length) {
    push("lexicon:");
    for (const entry of input.lexicon) {
      // Flow mapping, so every value takes the stricter quoting — a gloss with a comma
      // in it is the common case, not an edge one.
      const parts = [
        entry.entry_key ? `key: ${yamlScalar(entry.entry_key, true)}` : null,
        `lemma: ${yamlScalar(entry.lemma, true)}`,
        entry.word_class ? `pos: ${yamlScalar(entry.word_class, true)}` : null,
        entry.gloss ? `gloss: ${yamlScalar(entry.gloss, true)}` : null,
      ].filter(Boolean);
      push(`  - { ${parts.join(", ")} }`);
      if (entry.notes?.trim()) push(`    # ${entry.notes.trim().replace(/\n+/g, " ")}`);
    }
    push("");
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function notation(template: ExportTemplate): string {
  if (template.slots.length === 0) return "∅";
  // The prime marks a slot that names its own segments rather than taking its whole
  // class, exactly as `templateNotation` does — `CVC` and `CVC′` are different grammars.
  return template.slots
    .map((s) => {
      const symbol = s.phoneme_ipa === null ? s.class_symbol : `${s.class_symbol}′`;
      return s.optional ? `(${symbol})` : symbol;
    })
    .join("");
}

function describeConstraint(c: ExportConstraint): string {
  const term = (cls: string | null, ipa: string | null) => cls ?? (ipa ? `/${ipa}/` : "?");
  if (c.kind === "no_identical_adjacent") return "no identical adjacent segments";
  if (c.kind === "forbid_in_role") {
    return `${term(c.a_class_symbol, c.a_phoneme_ipa)} cannot be a ${c.role}`;
  }
  const where = c.seq_position && c.seq_position !== "anywhere" ? ` ${c.seq_position}` : "";
  return `${term(c.a_class_symbol, c.a_phoneme_ipa)}${term(c.b_class_symbol, c.b_phoneme_ipa)} not allowed${where}`;
}

// lexicon CSV --------------------------------------------------------------------------

/**
 * Two columns, no header — the shape of `vocab_beta_1.csv` and `dict_1.1.csv`, so this
 * drops straight into whatever already reads those.
 *
 * An entry with no key falls back to its lemma, because the co-designer's files are keyed
 * throughout and a blank first column would break a naive reader.
 */
export function toLexiconCsv(input: ExportInput): string {
  return `${input.lexicon
    .map((e) => `${csvField(e.entry_key ?? e.lemma)},${csvField(e.lemma)}`)
    .join("\n")}\n`;
}

/** The richer CSV, with a header, for reading rather than for feeding the old tools. */
export function toLexiconCsvFull(input: ExportInput): string {
  const rows = input.lexicon.map((e) =>
    [e.entry_key ?? "", e.lemma, e.word_class ?? "", e.gloss ?? "", e.notes ?? ""]
      .map(csvField)
      .join(","),
  );
  return `key,lemma,pos,gloss,notes\n${rows.join("\n")}\n`;
}

// corpus CSV ---------------------------------------------------------------------------

/**
 * `english,conlang`, with that header.
 *
 * The lexicon's two-column export is headerless because it has to drop into tools that
 * already read `vocab_beta_1.csv`. Nothing pre-existing reads the corpus, so it gets a
 * header: it costs one line, it says which column is which in a file where both are
 * prose and neither is guessable, and `parseCorpusCsv` skips it on the way back in.
 */
export function toCorpusCsv(input: ExportInput): string {
  const rows = input.corpus.map((e) => `${csvField(e.english)},${csvField(e.conlang)}`);
  return `english,conlang\n${rows.join("\n")}\n`;
}

/** A filename stem safe on every platform, derived from the project name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "conlang";
}
