/**
 * The morphology plugin document: parse it, validate it, and turn it plus a project's
 * lexicon into the `MorphologySpec` the engine (`morphology.ts`) consumes.
 *
 * Pure — no `vue`, `pinia`, or Supabase client, like `morphology.ts` and for the same
 * reason. `morphologySpec.test.ts` pins the parsing.
 *
 * The document is authored by the project owner (stored as jsonb in `project_morphology`,
 * see migration 0029). It names which lexicon rows are bound affixes and which are free
 * stems, the slot order of the phonological word, and the phonological rules. With **no
 * document** (`assembleSpec(entries, null)`) the engine still recognises exact lexicon
 * forms — every entry becomes a citation stem, and nothing is segmented.
 */

import type {
  AffixEntry,
  MorphPosition,
  MorphologySpec,
  RuleConfig,
  StemEntry,
} from "./morphology";

/** The stored side, structural rather than `LexiconEntry`, to keep this module import-free. */
export interface LexiconRow {
  lemma: string;
  entry_key: string | null;
  gloss: string | null;
  word_class: string | null;
}

export type AffixMatch =
  | { entryKeyPrefix: string }
  | { entryKey: string | string[] }
  | { wordClass: string | string[] };

export interface AffixRuleDoc {
  match: AffixMatch;
  role: string;
  position: MorphPosition;
}

export interface StemRuleDoc {
  wordClass: string | string[];
  slotClass: StemEntry["slotClass"];
}

export interface RuleDoc {
  vowels?: string;
  glides?: string;
  digraphs?: string[];
  reduplication?: { enabled?: boolean };
  harmony?: { enabled?: boolean; pairs?: Record<string, string>; neutral?: string };
  elision?: { enabled?: boolean };
  lowering?: { enabled?: boolean; after?: string; map?: Record<string, string> };
}

export interface MorphologySpecDoc {
  version?: number;
  rules: RuleDoc;
  /** Template name → ordered slot names, each list containing exactly one `"STEM"`. */
  slots: { nominal: string[]; predicate: string[] };
  affixes: AffixRuleDoc[];
  stems: StemRuleDoc[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);
const lower = (s: string) => s.trim().toLowerCase();

const DEFAULT_RULES: RuleConfig = {
  vowels: "aeiou",
  glides: "jw",
  digraphs: [],
  reduplication: { enabled: false },
  harmony: { enabled: false, pairs: {}, neutral: "" },
  elision: { enabled: false },
  lowering: { enabled: false, after: "w", map: { u: "o" } },
};

// ---------------------------------------------------------------------------
// parseSpec
// ---------------------------------------------------------------------------

/**
 * Validate a parsed JSON value as a plugin document. Returns a best-effort `doc` together
 * with **every** problem found (not the first). `doc` is `null` only when the input is not
 * an object or carries no usable `slots` — otherwise the caller can still preview what the
 * document would do while the author fixes the listed problems. Never throws.
 */
export function parseSpec(input: unknown): { doc: MorphologySpecDoc | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObject(input)) {
    return { doc: null, problems: ["the plugin must be a JSON object"] };
  }

  const rawSlots = input.slots;
  const slots = { nominal: ["STEM"], predicate: ["STEM"] };
  let slotsUsable = true;
  if (!isObject(rawSlots)) {
    problems.push('"slots" must be an object with "nominal" and "predicate" templates');
    slotsUsable = false;
  } else {
    for (const key of ["nominal", "predicate"] as const) {
      const template = rawSlots[key];
      if (!Array.isArray(template) || template.some((s) => typeof s !== "string")) {
        problems.push(`"slots.${key}" must be an array of slot names`);
        slotsUsable = false;
        continue;
      }
      const names = template.map(String);
      const stemCount = names.filter((s) => s === "STEM").length;
      if (stemCount !== 1) {
        problems.push(`"slots.${key}" must contain exactly one "STEM" (found ${stemCount})`);
      }
      if (names.some((s) => s.trim() === "")) problems.push(`"slots.${key}" has a blank slot name`);
      slots[key] = names;
    }
  }

  const templateRoles = new Set([...slots.nominal, ...slots.predicate]);

  const rawAffixes = Array.isArray(input.affixes) ? input.affixes : [];
  if (input.affixes !== undefined && !Array.isArray(input.affixes)) {
    problems.push('"affixes" must be an array');
  }
  const affixes: AffixRuleDoc[] = [];
  rawAffixes.forEach((raw, i) => {
    if (!isObject(raw)) {
      problems.push(`affixes[${i}] must be an object`);
      return;
    }
    const role = typeof raw.role === "string" ? raw.role : "";
    const position = raw.position;
    if (!role) problems.push(`affixes[${i}] is missing a "role"`);
    else if (!templateRoles.has(role)) {
      problems.push(`affixes[${i}] role "${role}" appears in no slot template`);
    }
    if (position !== "prefix" && position !== "suffix") {
      problems.push(`affixes[${i}] "position" must be "prefix" or "suffix"`);
    }
    const match = parseMatch(raw.match, i, problems);
    if (match && role && (position === "prefix" || position === "suffix")) {
      affixes.push({ match, role, position });
    }
  });

  const rawStems = Array.isArray(input.stems) ? input.stems : [];
  if (input.stems !== undefined && !Array.isArray(input.stems)) {
    problems.push('"stems" must be an array');
  }
  const stems: StemRuleDoc[] = [];
  rawStems.forEach((raw, i) => {
    if (!isObject(raw)) {
      problems.push(`stems[${i}] must be an object`);
      return;
    }
    const wc = raw.wordClass;
    const ok =
      typeof wc === "string" || (Array.isArray(wc) && wc.every((x) => typeof x === "string"));
    if (!ok) problems.push(`stems[${i}] "wordClass" must be a string or string array`);
    const sc = raw.slotClass;
    if (sc !== "nominal" && sc !== "predicate" && sc !== "both") {
      problems.push(`stems[${i}] "slotClass" must be "nominal", "predicate" or "both"`);
    }
    if (ok && (sc === "nominal" || sc === "predicate" || sc === "both")) {
      stems.push({ wordClass: wc as string | string[], slotClass: sc });
    }
  });

  const rules = (isObject(input.rules) ? input.rules : {}) as RuleDoc;
  if (input.rules !== undefined && !isObject(input.rules))
    problems.push('"rules" must be an object');
  if (rules.vowels !== undefined && (typeof rules.vowels !== "string" || rules.vowels === "")) {
    problems.push('"rules.vowels" must be a non-empty string');
  }

  if (!slotsUsable) return { doc: null, problems };
  return { doc: { version: numberOr(input.version, 1), rules, slots, affixes, stems }, problems };
}

function parseMatch(raw: unknown, i: number, problems: string[]): AffixMatch | null {
  if (!isObject(raw)) {
    problems.push(`affixes[${i}] is missing a "match"`);
    return null;
  }
  if (typeof raw.entryKeyPrefix === "string") return { entryKeyPrefix: raw.entryKeyPrefix };
  if (typeof raw.entryKey === "string" || Array.isArray(raw.entryKey)) {
    return { entryKey: raw.entryKey as string | string[] };
  }
  if (typeof raw.wordClass === "string" || Array.isArray(raw.wordClass)) {
    return { wordClass: raw.wordClass as string | string[] };
  }
  problems.push(`affixes[${i}] "match" needs one of entryKeyPrefix / entryKey / wordClass`);
  return null;
}

const numberOr = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

// ---------------------------------------------------------------------------
// assembleSpec
// ---------------------------------------------------------------------------

function rulesFrom(doc: RuleDoc): RuleConfig {
  const pairs: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc.harmony?.pairs ?? {})) {
    if (typeof v === "string") pairs[k] = v;
  }
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc.lowering?.map ?? {})) {
    if (typeof v === "string") map[k] = v;
  }
  return {
    vowels: doc.vowels || DEFAULT_RULES.vowels,
    glides: doc.glides ?? DEFAULT_RULES.glides,
    digraphs: Array.isArray(doc.digraphs) ? doc.digraphs.filter((d) => typeof d === "string") : [],
    reduplication: { enabled: !!doc.reduplication?.enabled },
    harmony: {
      enabled: !!doc.harmony?.enabled,
      pairs,
      neutral: typeof doc.harmony?.neutral === "string" ? doc.harmony.neutral : "",
    },
    elision: { enabled: !!doc.elision?.enabled },
    lowering: {
      enabled: !!doc.lowering?.enabled,
      after: typeof doc.lowering?.after === "string" ? doc.lowering.after : "w",
      map: Object.keys(map).length > 0 ? map : { u: "o" },
    },
  };
}

function matchesAffix(row: LexiconRow, match: AffixMatch): boolean {
  if ("entryKeyPrefix" in match) return (row.entry_key ?? "").startsWith(match.entryKeyPrefix);
  if ("entryKey" in match) return asArray(match.entryKey).includes(row.entry_key ?? "");
  return asArray(match.wordClass)
    .map(lower)
    .includes(lower(row.word_class ?? ""));
}

export interface AssembleResult {
  spec: MorphologySpec;
  /** `word_class` values no stem or affix rule mentioned — treated as plain stems. */
  problems: string[];
}

/**
 * Build the engine spec from the lexicon and a plugin document. `doc === null` yields a
 * citation-only spec: every entry is a free stem, there are no affixes, and nothing is
 * segmented — so `analyze` resolves only exact lemma matches.
 */
export function assembleSpec(
  entries: readonly LexiconRow[],
  doc: MorphologySpecDoc | null,
): AssembleResult {
  const rows = entries.filter((r) => r.lemma.trim() !== "");

  if (!doc) {
    return {
      spec: {
        rules: DEFAULT_RULES,
        order: { nominal: ["STEM"], predicate: ["STEM"] },
        stems: rows.map((r) => ({
          lemma: r.lemma.trim(),
          entryKey: r.entry_key,
          gloss: r.gloss,
          wordClass: r.word_class,
          slotClass: "both" as const,
        })),
        affixes: [],
      },
      problems: [],
    };
  }

  const affixes: AffixEntry[] = [];
  const stems: StemEntry[] = [];
  const unmapped = new Set<string>();

  for (const row of rows) {
    const lemma = row.lemma.trim();

    for (const rule of doc.affixes) {
      if (matchesAffix(row, rule.match)) {
        affixes.push({
          form: lemma,
          role: rule.role,
          position: rule.position,
          entryKey: row.entry_key,
          gloss: row.gloss,
          wordClass: row.word_class,
        });
      }
    }

    const stemRule = doc.stems.find((s) =>
      asArray(s.wordClass)
        .map(lower)
        .includes(lower(row.word_class ?? "")),
    );
    stems.push({
      lemma,
      entryKey: row.entry_key,
      gloss: row.gloss,
      wordClass: row.word_class,
      slotClass: stemRule?.slotClass ?? "both",
    });
    if (!stemRule && !affixes.some((a) => a.form === lemma && a.entryKey === row.entry_key)) {
      unmapped.add((row.word_class ?? "∅").trim() || "∅");
    }
  }

  const problems =
    unmapped.size > 0
      ? [
          `word classes with no stem or affix rule, treated as plain stems: ${[...unmapped].sort().join(", ")}`,
        ]
      : [];

  return {
    spec: {
      rules: rulesFrom(doc.rules),
      order: { nominal: doc.slots.nominal, predicate: doc.slots.predicate },
      stems,
      affixes,
    },
    problems,
  };
}
