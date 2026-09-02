/**
 * The IPA chart, as static reference data.
 *
 * Deliberately not a database table: it is identical for every project, so a table
 * would add a join and a fetch and buy nothing. A project's inventory (the `phonemes`
 * table) stores only which symbols are selected.
 *
 * The feature labels here are the IPA's, not the conlang's. The co-designer's notes
 * (conlang/docs/overview.md:10) deliberately leave voicing and manner underspecified —
 * the language is text-based, so "it doesn't matter if plosives are delineated by
 * voicedness or aspiration". These labels are a way to find a symbol on a chart, not a
 * claim about the language.
 *
 * Out of scope for now: diacritics, suprasegmentals, and tone. Both symbols the conlang
 * actually needs beyond ASCII — ŋ and ʔ — are plain pulmonic entries.
 */

export type PhoneKind = "consonant" | "vowel";

export type Phone = {
  ipa: string;
  kind: PhoneKind;
  /** Full articulatory description, used as the accessible label and tooltip. */
  name: string;
};

function phone(ipa: string, kind: PhoneKind, name: string): Phone {
  return { ipa, kind, name };
}

// Pulmonic consonants ------------------------------------------------------------
// The canonical grid: manner down, place across. A cell holds a voiceless/voiced pair,
// either of which may be absent (no symbol exists), or the whole cell may be judged
// impossible, which the chart shades exactly as the printed one does.

export const PLACES = [
  "Bilabial",
  "Labiodental",
  "Dental",
  "Alveolar",
  "Postalveolar",
  "Retroflex",
  "Palatal",
  "Velar",
  "Uvular",
  "Pharyngeal",
  "Glottal",
] as const;

export const MANNERS = [
  "Plosive",
  "Nasal",
  "Trill",
  "Tap or flap",
  "Fricative",
  "Lateral fricative",
  "Approximant",
  "Lateral approximant",
] as const;

export type Place = (typeof PLACES)[number];
export type Manner = (typeof MANNERS)[number];

/** `[voiceless, voiced]`, null where no symbol exists; or the whole cell impossible. */
type Cell = readonly [string | null, string | null] | "impossible";

const PULMONIC: Record<Manner, readonly Cell[]> = {
  Plosive: [
    ["p", "b"],
    [null, null],
    [null, null],
    ["t", "d"],
    [null, null],
    ["ʈ", "ɖ"],
    ["c", "ɟ"],
    ["k", "ɡ"],
    ["q", "ɢ"],
    "impossible",
    ["ʔ", null],
  ],
  Nasal: [
    [null, "m"],
    [null, "ɱ"],
    [null, null],
    [null, "n"],
    [null, null],
    [null, "ɳ"],
    [null, "ɲ"],
    [null, "ŋ"],
    [null, "ɴ"],
    "impossible",
    "impossible",
  ],
  Trill: [
    [null, "ʙ"],
    [null, null],
    [null, null],
    [null, "r"],
    [null, null],
    "impossible",
    "impossible",
    "impossible",
    [null, "ʀ"],
    [null, null],
    "impossible",
  ],
  "Tap or flap": [
    [null, "ⱱ"],
    [null, null],
    [null, null],
    [null, "ɾ"],
    [null, null],
    [null, "ɽ"],
    "impossible",
    "impossible",
    "impossible",
    [null, null],
    "impossible",
  ],
  Fricative: [
    ["ɸ", "β"],
    ["f", "v"],
    ["θ", "ð"],
    ["s", "z"],
    ["ʃ", "ʒ"],
    ["ʂ", "ʐ"],
    ["ç", "ʝ"],
    ["x", "ɣ"],
    ["χ", "ʁ"],
    ["ħ", "ʕ"],
    ["h", "ɦ"],
  ],
  "Lateral fricative": [
    [null, null],
    [null, null],
    [null, null],
    ["ɬ", "ɮ"],
    [null, null],
    [null, null],
    [null, null],
    [null, null],
    [null, null],
    "impossible",
    "impossible",
  ],
  Approximant: [
    [null, null],
    [null, "ʋ"],
    [null, null],
    [null, "ɹ"],
    [null, null],
    [null, "ɻ"],
    [null, "j"],
    [null, "ɰ"],
    [null, null],
    [null, null],
    "impossible",
  ],
  "Lateral approximant": [
    [null, null],
    [null, null],
    [null, null],
    [null, "l"],
    [null, null],
    [null, "ɭ"],
    [null, "ʎ"],
    [null, "ʟ"],
    [null, null],
    "impossible",
    "impossible",
  ],
};

export type PulmonicCell = {
  place: Place;
  manner: Manner;
  impossible: boolean;
  voiceless: Phone | null;
  voiced: Phone | null;
};

export const PULMONIC_ROWS: { manner: Manner; cells: PulmonicCell[] }[] = MANNERS.map((manner) => ({
  manner,
  cells: PLACES.map((place, i) => {
    const cell = PULMONIC[manner][i];
    if (cell === undefined || cell === "impossible") {
      return { place, manner, impossible: true, voiceless: null, voiced: null };
    }
    const [voiceless, voiced] = cell;
    const describe = (voicing: string) =>
      `${voicing} ${place.toLowerCase()} ${manner.toLowerCase()}`;
    return {
      place,
      manner,
      impossible: false,
      voiceless: voiceless ? phone(voiceless, "consonant", describe("voiceless")) : null,
      voiced: voiced ? phone(voiced, "consonant", describe("voiced")) : null,
    };
  }),
}));

// Non-pulmonic consonants and the "other symbols" block ---------------------------
// This is where the conlang's `w` lives: it is coarticulated, so it is not on the
// pulmonic grid at all. `j` is a plain palatal approximant and is.

export type PhoneGroup = { label: string; phones: Phone[] };

export const NON_PULMONIC: PhoneGroup[] = [
  {
    label: "Clicks",
    phones: [
      phone("ʘ", "consonant", "bilabial click"),
      phone("ǀ", "consonant", "dental click"),
      phone("ǃ", "consonant", "(post)alveolar click"),
      phone("ǂ", "consonant", "palatoalveolar click"),
      phone("ǁ", "consonant", "alveolar lateral click"),
    ],
  },
  {
    label: "Voiced implosives",
    phones: [
      phone("ɓ", "consonant", "voiced bilabial implosive"),
      phone("ɗ", "consonant", "voiced dental or alveolar implosive"),
      phone("ʄ", "consonant", "voiced palatal implosive"),
      phone("ɠ", "consonant", "voiced velar implosive"),
      phone("ʛ", "consonant", "voiced uvular implosive"),
    ],
  },
  {
    label: "Ejectives",
    phones: [
      phone("pʼ", "consonant", "bilabial ejective"),
      phone("tʼ", "consonant", "alveolar ejective"),
      phone("kʼ", "consonant", "velar ejective"),
      phone("sʼ", "consonant", "alveolar fricative ejective"),
    ],
  },
];

export const OTHER_SYMBOLS: PhoneGroup[] = [
  {
    label: "Coarticulated",
    phones: [
      phone("ʍ", "consonant", "voiceless labial-velar fricative"),
      phone("w", "consonant", "voiced labial-velar approximant"),
      phone("ɥ", "consonant", "voiced labial-palatal approximant"),
      phone("ɧ", "consonant", "simultaneous ʃ and x"),
      phone("k͡p", "consonant", "voiceless labial-velar plosive"),
      phone("ɡ͡b", "consonant", "voiced labial-velar plosive"),
      phone("ŋ͡m", "consonant", "labial-velar nasal"),
    ],
  },
  {
    label: "Other fricatives and flaps",
    phones: [
      phone("ɕ", "consonant", "voiceless alveolo-palatal fricative"),
      phone("ʑ", "consonant", "voiced alveolo-palatal fricative"),
      phone("ʜ", "consonant", "voiceless epiglottal fricative"),
      phone("ʢ", "consonant", "voiced epiglottal fricative"),
      phone("ʡ", "consonant", "epiglottal plosive"),
      phone("ɺ", "consonant", "voiced alveolar lateral flap"),
    ],
  },
  {
    label: "Affricates",
    phones: [
      phone("t͡s", "consonant", "voiceless alveolar affricate"),
      phone("d͡z", "consonant", "voiced alveolar affricate"),
      phone("t͡ʃ", "consonant", "voiceless postalveolar affricate"),
      phone("d͡ʒ", "consonant", "voiced postalveolar affricate"),
      phone("t͡ɕ", "consonant", "voiceless alveolo-palatal affricate"),
      phone("d͡ʑ", "consonant", "voiced alveolo-palatal affricate"),
    ],
  },
];

// Vowels ---------------------------------------------------------------------------
/**
 * The quadrilateral, as coordinates rather than as a grid.
 *
 * The chart is a trapezoid because the vowel space is one: there is less front-back room
 * the further the jaw opens, so the front edge slants inward while the back edge stays
 * vertical. The first version of this laid the symbols out on a rectangular grid and drew
 * a trapezoid behind them, which put every open and near-open symbol outside the outline
 * it was supposed to sit on — and had nowhere at all for the seven vowels that are not on
 * a major row (ɪ ʏ ʊ ə æ ɐ), which ended up in a leftover list underneath.
 *
 * So positions are stored, not inferred from a row and a column. `x` is backness within
 * the row (0 front, 1 back) and `y` is height (0 close, 1 open). Both are phonetic
 * coordinates rather than layout: `vowelPoint` is the only thing that knows about the
 * slant, and nothing here is in pixels.
 */

export type VowelHeight =
  | "Close"
  | "Near-close"
  | "Close-mid"
  | "Mid"
  | "Open-mid"
  | "Near-open"
  | "Open";

export type VowelBackness = "front" | "near-front" | "central" | "near-back" | "back";

/**
 * `major` rows are the four the printed chart rules a line across. The other three carry
 * real vowels but no line, which is why they cannot simply be extra grid rows.
 */
export const VOWEL_HEIGHTS: readonly { label: VowelHeight; y: number; major: boolean }[] = [
  { label: "Close", y: 0, major: true },
  { label: "Near-close", y: 1 / 6, major: false },
  { label: "Close-mid", y: 2 / 6, major: true },
  { label: "Mid", y: 3 / 6, major: false },
  { label: "Open-mid", y: 4 / 6, major: true },
  { label: "Near-open", y: 5 / 6, major: false },
  { label: "Open", y: 1, major: true },
];

const BACKNESS_X: Record<VowelBackness, number> = {
  front: 0,
  "near-front": 0.25,
  central: 0.5,
  "near-back": 0.75,
  back: 1,
};

/** The three columns the chart labels and rules a line down. */
export const VOWEL_BACKNESSES: readonly { label: string; x: number }[] = [
  { label: "Front", x: 0 },
  { label: "Central", x: 0.5 },
  { label: "Back", x: 1 },
];

/**
 * How far in the front edge has slanted by the open row, as a fraction of the width.
 *
 * Geometry, so it lives with the coordinates rather than in the stylesheet: the symbols
 * and the outline have to agree, and a value in CSS could only be kept in step by hand.
 */
export const VOWEL_FRONT_INSET = 0.42;

/** Where the front edge sits at a given height. */
export const vowelFrontEdge = (y: number) => y * VOWEL_FRONT_INSET;

/**
 * A phonetic position as a fraction of the plot area, with the slant applied.
 *
 * Backness is relative to the row, not absolute: `x: 0` is wherever the front edge has
 * got to at that height, which is what keeps `a` on the same line as `i`.
 */
export function vowelPoint(x: number, y: number): { x: number; y: number } {
  const left = vowelFrontEdge(y);
  return { x: left + x * (1 - left), y };
}

export type VowelPosition = {
  height: VowelHeight;
  backness: VowelBackness;
  /** Fractions of the plot area, slant already applied. */
  x: number;
  y: number;
  unrounded: Phone | null;
  rounded: Phone | null;
};

/** `[height, backness, unrounded, rounded]`, in the printed chart's reading order. */
const VOWEL_TABLE: readonly (readonly [
  VowelHeight,
  VowelBackness,
  string | null,
  string | null,
])[] = [
  ["Close", "front", "i", "y"],
  ["Close", "central", "ɨ", "ʉ"],
  ["Close", "back", "ɯ", "u"],
  ["Near-close", "near-front", "ɪ", "ʏ"],
  ["Near-close", "near-back", null, "ʊ"],
  ["Close-mid", "front", "e", "ø"],
  ["Close-mid", "central", "ɘ", "ɵ"],
  ["Close-mid", "back", "ɤ", "o"],
  ["Mid", "central", "ə", null],
  ["Open-mid", "front", "ɛ", "œ"],
  ["Open-mid", "central", "ɜ", "ɞ"],
  ["Open-mid", "back", "ʌ", "ɔ"],
  ["Near-open", "front", "æ", null],
  ["Near-open", "central", "ɐ", null],
  ["Open", "front", "a", "ɶ"],
  ["Open", "back", "ɑ", "ɒ"],
];

const HEIGHT_Y = new Map(VOWEL_HEIGHTS.map((h) => [h.label, h.y] as const));

export const VOWEL_POSITIONS: VowelPosition[] = VOWEL_TABLE.map(
  ([height, backness, unrounded, rounded]) => {
    const point = vowelPoint(BACKNESS_X[backness], HEIGHT_Y.get(height) ?? 0);
    const describe = (rounding: string) =>
      `${height.toLowerCase()} ${backness.replace("-", " ")} ${rounding} vowel`;
    return {
      height,
      backness,
      ...point,
      unrounded: unrounded ? phone(unrounded, "vowel", describe("unrounded")) : null,
      rounded: rounded ? phone(rounded, "vowel", describe("rounded")) : null,
    };
  },
);

// Lookups -------------------------------------------------------------------------
// Built once here so no component or store re-derives them.

function collect(): Phone[] {
  const out: Phone[] = [];
  for (const row of PULMONIC_ROWS) {
    for (const cell of row.cells) {
      if (cell.voiceless) out.push(cell.voiceless);
      if (cell.voiced) out.push(cell.voiced);
    }
  }
  for (const group of [...NON_PULMONIC, ...OTHER_SYMBOLS]) out.push(...group.phones);
  for (const pos of VOWEL_POSITIONS) {
    if (pos.unrounded) out.push(pos.unrounded);
    if (pos.rounded) out.push(pos.rounded);
  }
  return out;
}

/**
 * Place, manner and voicing per pulmonic symbol.
 *
 * `Phone.name` already carries this, but as prose ("voiced velar nasal"). The class
 * editor's quick-fill ("all nasals", "all plosives") needs it queryable, and parsing it
 * back out of the label would be a silent dependency on that string's wording.
 *
 * Non-pulmonic and "other symbols" entries are absent by design: they have no cell on
 * the grid, so there is no place/manner pair to record.
 */
export type PhoneFeatures = { place: Place; manner: Manner; voiced: boolean };

export const FEATURES_BY_IPA: Map<string, PhoneFeatures> = new Map(
  PULMONIC_ROWS.flatMap((row) =>
    row.cells.flatMap((cell) => {
      const out: [string, PhoneFeatures][] = [];
      const { place, manner } = cell;
      if (cell.voiceless) out.push([cell.voiceless.ipa, { place, manner, voiced: false }]);
      if (cell.voiced) out.push([cell.voiced.ipa, { place, manner, voiced: true }]);
      return out;
    }),
  ),
);

/** Every phone on the chart, in reading order. */
export const ALL_PHONES: Phone[] = collect();

export const PHONE_BY_IPA: Map<string, Phone> = new Map(ALL_PHONES.map((p) => [p.ipa, p]));

/** Chart position, so a stored inventory can be listed in chart order. */
export const PHONE_ORDER: Map<string, number> = new Map(
  ALL_PHONES.map((p, i) => [p.ipa, i] as const),
);
