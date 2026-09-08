/**
 * The morphology recognition engine: given a surface word from corpus conlang text, work
 * out which lexicon stem it is an inflected form of, and how it is built.
 *
 * **This module must not import from `vue`, `pinia`, or `@/lib/supabase`.** It is
 * deliberately pure so the corpus view and any future consumer (a gloss export, a parser
 * check) run exactly the same code; an import from any of those would quietly end that.
 * `morphology.test.ts` asserts the import list is empty rather than trusting this comment.
 *
 * The approach is concatenative segmentation, not a generative paradigm: peel known
 * prefixes and suffixes off a token, spot reduplication, and match what is left against a
 * stem. Everything language-specific — the affix inventory, the slot order, the
 * phonological rules — is supplied by the caller in a `MorphologySpec`, which
 * `morphologySpec.ts` builds from a project's own plugin document plus its lexicon.
 * `syllabify` and `reduplicant` are a hand port of
 * `xenolinguistics-harness/scoring/tier1/own_conlang_grammar.py` (`syllables`,
 * `reduplicant`); keep the two in step if that file's rule changes.
 *
 * Phonological rules (vowel harmony, onset elision, lowering) are handled *approximately*:
 * `affixVariants` expands each affix into the small set of forms it can surface as under
 * the declared rules, and the peeler matches any of them. It does not run a full ordered
 * feeding derivation in reverse — enough for a hover hint, not a claim of completeness.
 */

export type MorphPosition = "prefix" | "suffix";

/** A slot name the plugin author chooses. `parseSpec` checks each one appears in a template. */
export type SlotRole = string;

/** One bound morpheme, derived from a lexicon entry by `morphologySpec.ts`. */
export interface AffixEntry {
  form: string;
  role: SlotRole;
  position: MorphPosition;
  /** The lexicon `entry_key` this came from, so the preview card can link the chip. */
  entryKey: string | null;
  gloss: string | null;
  wordClass: string | null;
}

/** One free stem: an open-class word, or a pronoun / demonstrative / numeral / bare modal. */
export interface StemEntry {
  lemma: string;
  entryKey: string | null;
  gloss: string | null;
  wordClass: string | null;
  slotClass: "nominal" | "predicate" | "both";
}

/**
 * The phonological-rule half of the spec. `syllabify` uses `vowels` / `glides` /
 * `digraphs`; the rest drive `affixVariants`.
 */
export interface RuleConfig {
  vowels: string;
  glides: string;
  /** Multi-character segments (e.g. "ng", "ts"). The syllabifier treats each as one unit. */
  digraphs: readonly string[];
  /** Plural = a copy of the final two syllables prefixed to the stem. */
  reduplication: { enabled: boolean };
  /** Non-low vowels agree in frontness across a morpheme boundary. `neutral` vowels do not. */
  harmony: { enabled: boolean; pairs: Readonly<Record<string, string>>; neutral: string };
  /** An onset glide after a consonant elides. */
  elision: { enabled: boolean };
  /** A vowel lowers after a labiovelar glide, e.g. `u` → `o` after `w`. */
  lowering: { enabled: boolean; after: string; map: Readonly<Record<string, string>> };
}

/** `"STEM"` marks where the stem sits between the ordered affix slots. */
export const STEM = "STEM";
export type OrderSlot = SlotRole;

export interface MorphologySpec {
  rules: RuleConfig;
  stems: readonly StemEntry[];
  affixes: readonly AffixEntry[];
  order: {
    nominal: readonly OrderSlot[];
    predicate: readonly OrderSlot[];
  };
}

export interface Morpheme {
  /** The surface slice this morpheme accounts for. */
  form: string;
  role: SlotRole | "stem";
  entryKey: string | null;
  gloss: string | null;
  wordClass: string | null;
}

export interface Analysis {
  lemma: string;
  lemmaEntryKey: string | null;
  gloss: string | null;
  wordClass: string | null;
  morphemes: readonly Morpheme[];
  reduplicated: boolean;
  source: "citation" | "segmented";
  /** Higher is a better reading. Used only for ordering; not meaningful in isolation. */
  score: number;
}

/** An affix with its surface variants precomputed (see `affixVariants`). */
export interface PreparedAffix {
  affix: AffixEntry;
  /** The affix's canonical form plus its rule-derived alternants, longest first. */
  forms: readonly string[];
}

export interface Recognizer {
  readonly stemLemmas: ReadonlySet<string>;
  readonly stemsByLemma: ReadonlyMap<string, readonly StemEntry[]>;
  readonly prefixes: readonly PreparedAffix[];
  readonly suffixes: readonly PreparedAffix[];
  readonly spec: MorphologySpec;
  /** Non-fatal issues found while building — duplicate affix forms, and the like. */
  readonly problems: readonly string[];
}

export type AnalyzeResult =
  | { ok: true; analyses: readonly Analysis[] }
  | { ok: false; reason: string };

export interface Token {
  text: string;
  start: number;
  end: number;
  kind: "word" | "gap";
}

/** A stem shorter than this is never left as the residue of a peel. */
const MIN_STEM_LENGTH = 2;
/** Ceiling on segmentation branches explored for one token, so a pathological affix set
 *  cannot hang the caller. */
const MAX_BRANCHES = 2000;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ANALYSES = 8;
/** An affix cannot explode into more surface variants than this. */
const MAX_AFFIX_VARIANTS = 8;

// ---------------------------------------------------------------------------
// Syllabification (ported from own_conlang_grammar.py)
// ---------------------------------------------------------------------------

/** Split a word into digraph-aware segments: a leading digraph if one matches, else one
 *  code point. Iterating the string this way is the only safe way to walk it — `ŋ`, `ʔ`
 *  and the digraphs are multi-unit. */
function segmentize(word: string, cfg: RuleConfig): string[] {
  const digraphs = [...cfg.digraphs].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  const chars = [...word];
  let i = 0;
  while (i < chars.length) {
    const rest = chars.slice(i).join("");
    const hit = digraphs.find((d) => d.length > 0 && rest.startsWith(d));
    if (hit) {
      out.push(hit);
      i += [...hit].length;
    } else {
      out.push(chars[i] ?? "");
      i += 1;
    }
  }
  return out;
}

const isVowel = (seg: string, cfg: RuleConfig): boolean =>
  seg.length > 0 && cfg.vowels.includes(seg);
const isGlide = (seg: string, cfg: RuleConfig): boolean =>
  seg.length > 0 && cfg.glides.includes(seg);

/**
 * Split a word into syllables at vowel nuclei, giving each nucleus the maximal legal onset
 * (one consonant, optionally followed by a glide). Used by reduplication, which copies the
 * final two syllables of a stem.
 */
export function syllabify(word: string, cfg: RuleConfig): string[] {
  const segs = segmentize(word, cfg);
  const nuclei: number[] = [];
  segs.forEach((s, idx) => {
    if (isVowel(s, cfg)) nuclei.push(idx);
  });
  if (nuclei.length === 0) return word ? [word] : [];

  const starts = new Set<number>([0]);
  for (const n of nuclei.slice(1)) {
    let onset = n;
    while (onset > 0 && !isVowel(segs[onset - 1] ?? "", cfg)) onset -= 1;
    const cluster = n - onset;
    if (cluster >= 2 && isGlide(segs[n - 1] ?? "", cfg)) starts.add(n - 2);
    else if (cluster >= 1) starts.add(n - 1);
    else starts.add(n);
  }

  const bounds = [...starts].sort((a, b) => a - b);
  const out: string[] = [];
  for (let k = 0; k < bounds.length; k += 1) {
    const from = bounds[k] ?? 0;
    const to = bounds[k + 1] ?? segs.length;
    out.push(segs.slice(from, to).join(""));
  }
  return out;
}

/**
 * The plural copy: the final two syllables of the word, or the whole word if it is
 * monosyllabic. Prefixed to the stem to form the plural.
 */
export function reduplicant(word: string, cfg: RuleConfig): string {
  const syls = syllabify(word, cfg);
  if (syls.length === 0) return word;
  return syls.slice(-2).join("");
}

const swapAt = (segs: readonly string[], i: number, seg: string): string =>
  [...segs.slice(0, i), seg, ...segs.slice(i + 1)].join("");

/**
 * The set of surface strings an affix can appear as once the declared phonological rules
 * have applied — the affix's own form plus its harmony / lowering / elision alternants.
 * The peeler matches a token's edge against any of these.
 *
 * This is an approximation. It generates the alternants an affix vowel *could* take
 * without knowing the stem it lands on, rather than deriving the one form a full ordered
 * rule pipeline would produce. Capped at `MAX_AFFIX_VARIANTS`.
 */
export function affixVariants(form: string, cfg: RuleConfig): string[] {
  const forms = new Set<string>([form]);

  if (cfg.harmony.enabled) {
    const alt = new Map<string, string>();
    for (const [a, b] of Object.entries(cfg.harmony.pairs)) {
      alt.set(a, b);
      alt.set(b, a);
    }
    // Two passes: a second harmonic vowel in the affix can also alternate.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const f of [...forms]) {
        const segs = segmentize(f, cfg);
        segs.forEach((s, i) => {
          const other = alt.get(s);
          if (other && !cfg.harmony.neutral.includes(s)) forms.add(swapAt(segs, i, other));
        });
      }
    }
  }

  if (cfg.lowering.enabled) {
    const reverse = new Map(Object.entries(cfg.lowering.map).map(([k, v]) => [v, k]));
    for (const f of [...forms]) {
      const segs = segmentize(f, cfg);
      segs.forEach((s, i) => {
        if (segs[i - 1] !== cfg.lowering.after) return;
        const lowered = cfg.lowering.map[s];
        const raised = reverse.get(s);
        if (lowered) forms.add(swapAt(segs, i, lowered));
        if (raised) forms.add(swapAt(segs, i, raised));
      });
    }
  }

  if (cfg.elision.enabled) {
    for (const f of [...forms]) {
      const segs = segmentize(f, cfg);
      if (
        segs.length >= 3 &&
        !isVowel(segs[0] ?? "", cfg) &&
        isGlide(segs[1] ?? "", cfg) &&
        isVowel(segs[2] ?? "", cfg)
      ) {
        forms.add([segs[0], ...segs.slice(2)].join(""));
      }
    }
  }

  return [...forms].slice(0, MAX_AFFIX_VARIANTS);
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Split conlang text into alternating `word` / `gap` tokens that together cover the whole
 * string exactly — `tokens.map((t) => t.text).join("") === text`. Whitespace, punctuation
 * and newlines are `gap`. The render layer rebuilds the original text from these, so the
 * invariant is load-bearing, not cosmetic.
 */
export function tokenizeConlang(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{Letter}'ŋʔ]+/gu;
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ text: text.slice(cursor, start), start: cursor, end: start, kind: "gap" });
    }
    const end = start + match[0].length;
    tokens.push({ text: match[0], start, end, kind: "word" });
    cursor = end;
  }
  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), start: cursor, end: text.length, kind: "gap" });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Recognizer
// ---------------------------------------------------------------------------

export function buildRecognizer(spec: MorphologySpec): Recognizer {
  const stemsByLemma = new Map<string, StemEntry[]>();
  for (const stem of spec.stems) {
    const list = stemsByLemma.get(stem.lemma);
    if (list) list.push(stem);
    else stemsByLemma.set(stem.lemma, [stem]);
  }

  const problems: string[] = [];
  const seen = new Map<string, AffixEntry>();
  for (const affix of spec.affixes) {
    const key = `${affix.position}:${affix.role}:${affix.form}`;
    const prior = seen.get(key);
    if (prior && prior.entryKey !== affix.entryKey) {
      problems.push(
        `two ${affix.role} affixes share the form "${affix.form}" (${prior.entryKey ?? "?"}, ${affix.entryKey ?? "?"})`,
      );
    }
    seen.set(key, affix);
  }

  const byLen = (a: AffixEntry, b: AffixEntry) => b.form.length - a.form.length;
  const prepare = (a: AffixEntry): PreparedAffix => ({
    affix: a,
    forms: affixVariants(a.form, spec.rules).sort((x, y) => y.length - x.length),
  });
  return {
    stemLemmas: new Set(stemsByLemma.keys()),
    stemsByLemma,
    prefixes: spec.affixes
      .filter((a) => a.position === "prefix")
      .sort(byLen)
      .map(prepare),
    suffixes: spec.affixes
      .filter((a) => a.position === "suffix")
      .sort(byLen)
      .map(prepare),
    spec,
    problems,
  };
}

/**
 * Memoised `buildRecognizer`, keyed by the identity of the `stems` array. A store's
 * `entries` getter returns a fresh array on every mutation, so array identity is a precise
 * cache key; the spec reference is checked too in case only the rules changed.
 */
const recognizerCache = new WeakMap<
  readonly StemEntry[],
  { spec: MorphologySpec; recognizer: Recognizer }
>();

export function getRecognizer(spec: MorphologySpec): Recognizer {
  const cached = recognizerCache.get(spec.stems);
  if (cached && cached.spec === spec) return cached.recognizer;
  const recognizer = buildRecognizer(spec);
  recognizerCache.set(spec.stems, { spec, recognizer });
  return recognizer;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const stemMorpheme = (entry: StemEntry): Morpheme => ({
  form: entry.lemma,
  role: "stem",
  entryKey: entry.entryKey,
  gloss: entry.gloss,
  wordClass: entry.wordClass,
});

const affixMorpheme = (affix: AffixEntry, form: string): Morpheme => ({
  form,
  role: affix.role,
  entryKey: affix.entryKey,
  gloss: affix.gloss,
  wordClass: affix.wordClass,
});

/** Is `seq` an ordered subsequence of `template`? */
function isSubsequence(seq: readonly OrderSlot[], template: readonly OrderSlot[]): boolean {
  let t = 0;
  for (const slot of seq) {
    while (t < template.length && template[t] !== slot) t += 1;
    if (t >= template.length) return false;
    t += 1;
  }
  return true;
}

type Candidate = {
  stem: StemEntry;
  morphemes: Morpheme[];
  reduplicated: boolean;
};

export function analyze(
  surface: string,
  rec: Recognizer,
  opts?: { maxAnalyses?: number; maxDepth?: number },
): AnalyzeResult {
  const word = surface.trim();
  if (!word) return { ok: false, reason: "empty token" };

  const maxAnalyses = opts?.maxAnalyses ?? DEFAULT_MAX_ANALYSES;
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const { rules } = rec.spec;
  let branches = 0;

  /** Every valid morpheme sequence for `str`, in surface order. */
  function segment(str: string, depth: number): Candidate[] {
    if (depth > maxDepth || branches > MAX_BRANCHES) return [];
    branches += 1;
    const out: Candidate[] = [];

    // Whole residue is a stem (or a standalone closed-class word).
    for (const stem of rec.stemsByLemma.get(str) ?? []) {
      out.push({ stem, morphemes: [stemMorpheme(stem)], reduplicated: false });
    }

    // Reduplication: `X + X` or `reduplicant(X) + X`.
    if (rules.reduplication.enabled) {
      for (const [lemma, stems] of rec.stemsByLemma) {
        if (lemma.length < MIN_STEM_LENGTH || !str.endsWith(lemma)) continue;
        const head = str.slice(0, str.length - lemma.length);
        if (head === lemma || head === reduplicant(lemma, rules)) {
          const plural: Morpheme = {
            form: head,
            role: "plural",
            entryKey: null,
            gloss: "plural",
            wordClass: null,
          };
          // Morpheme order, not surface order: the copy is prefixed on the surface, but
          // the plural slot follows the stem, which is what the order templates check.
          for (const stem of stems) {
            out.push({ stem, morphemes: [stemMorpheme(stem), plural], reduplicated: true });
          }
        }
      }
    }

    // Peel a prefix (any of its surface variants).
    for (const p of rec.prefixes) {
      for (const f of p.forms) {
        if (!f || !str.startsWith(f)) continue;
        const rest = str.slice(f.length);
        if (rest.length < MIN_STEM_LENGTH) continue;
        for (const inner of segment(rest, depth + 1)) {
          out.push({
            stem: inner.stem,
            morphemes: [affixMorpheme(p.affix, f), ...inner.morphemes],
            reduplicated: inner.reduplicated,
          });
        }
      }
    }

    // Peel a suffix (any of its surface variants).
    for (const s of rec.suffixes) {
      for (const f of s.forms) {
        if (!f || !str.endsWith(f)) continue;
        const head = str.slice(0, str.length - f.length);
        if (head.length < MIN_STEM_LENGTH) continue;
        for (const inner of segment(head, depth + 1)) {
          out.push({
            stem: inner.stem,
            morphemes: [...inner.morphemes, affixMorpheme(s.affix, f)],
            reduplicated: inner.reduplicated,
          });
        }
      }
    }

    return out;
  }

  const candidates = segment(word, 0);
  const analyses: Analysis[] = [];
  const seen = new Set<string>();

  for (const cand of candidates) {
    const roles: OrderSlot[] = cand.morphemes.map((m) => (m.role === "stem" ? "STEM" : m.role));
    const { order } = rec.spec;
    const fitsNominal = cand.stem.slotClass !== "predicate" && isSubsequence(roles, order.nominal);
    const fitsPredicate =
      cand.stem.slotClass !== "nominal" && isSubsequence(roles, order.predicate);
    if (!fitsNominal && !fitsPredicate) continue;

    const key = `${cand.stem.entryKey ?? cand.stem.lemma}|${cand.morphemes
      .map((m) => `${m.role}:${m.form}`)
      .join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isCitation = cand.morphemes.length === 1 && !cand.reduplicated;
    // A stem that stands on either side of the phonological word (a particle, a modal) is
    // a function word; one fixed to nominal or predicate is content, and ranks higher.
    const isFunction = cand.stem.slotClass === "both";
    const score =
      (isCitation ? 1000 : 0) -
      cand.morphemes.length * 10 +
      cand.stem.lemma.length -
      (isFunction ? 50 : 0);

    analyses.push({
      lemma: cand.stem.lemma,
      lemmaEntryKey: cand.stem.entryKey,
      gloss: cand.stem.gloss,
      wordClass: cand.stem.wordClass,
      morphemes: cand.morphemes,
      reduplicated: cand.reduplicated,
      source: isCitation ? "citation" : "segmented",
      score,
    });
  }

  if (analyses.length === 0) {
    return {
      ok: false,
      reason: candidates.length > 0 ? "no valid segmentation" : "no known stem",
    };
  }

  analyses.sort((a, b) => b.score - a.score || a.lemma.localeCompare(b.lemma));
  return { ok: true, analyses: analyses.slice(0, maxAnalyses) };
}
