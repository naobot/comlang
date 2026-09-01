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
// The quadrilateral. Rows are height, columns are backness, and each position carries
// an unrounded/rounded pair — the same reading order as the printed chart.

export const VOWEL_HEIGHTS = ["Close", "Close-mid", "Open-mid", "Open"] as const;
export const VOWEL_BACKNESSES = ["Front", "Central", "Back"] as const;

export type VowelHeight = (typeof VOWEL_HEIGHTS)[number];
export type VowelBackness = (typeof VOWEL_BACKNESSES)[number];

export type VowelSlot = {
  height: VowelHeight;
  backness: VowelBackness;
  unrounded: Phone | null;
  rounded: Phone | null;
};

const VOWELS: Record<VowelHeight, readonly (readonly [string | null, string | null])[]> = {
  Close: [
    ["i", "y"],
    ["ɨ", "ʉ"],
    ["ɯ", "u"],
  ],
  "Close-mid": [
    ["e", "ø"],
    ["ɘ", "ɵ"],
    ["ɤ", "o"],
  ],
  "Open-mid": [
    ["ɛ", "œ"],
    ["ɜ", "ɞ"],
    ["ʌ", "ɔ"],
  ],
  Open: [
    ["a", "ɶ"],
    ["ɐ", null],
    ["ɑ", "ɒ"],
  ],
};

export const VOWEL_ROWS: { height: VowelHeight; slots: VowelSlot[] }[] = VOWEL_HEIGHTS.map(
  (height) => ({
    height,
    slots: VOWEL_BACKNESSES.map((backness, i) => {
      const pair = VOWELS[height][i] ?? [null, null];
      const [unrounded, rounded] = pair;
      const describe = (rounding: string) =>
        `${height.toLowerCase()} ${backness.toLowerCase()} ${rounding} vowel`;
      return {
        height,
        backness,
        unrounded: unrounded ? phone(unrounded, "vowel", describe("unrounded")) : null,
        rounded: rounded ? phone(rounded, "vowel", describe("rounded")) : null,
      };
    }),
  }),
);

/** On the chart, but not at a quadrilateral corner or edge midpoint. */
export const EXTRA_VOWELS: Phone[] = [
  phone("ɪ", "vowel", "near-close near-front unrounded vowel"),
  phone("ʏ", "vowel", "near-close near-front rounded vowel"),
  phone("ʊ", "vowel", "near-close near-back rounded vowel"),
  phone("ə", "vowel", "mid central vowel (schwa)"),
  phone("æ", "vowel", "near-open front unrounded vowel"),
];

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
  for (const row of VOWEL_ROWS) {
    for (const slot of row.slots) {
      if (slot.unrounded) out.push(slot.unrounded);
      if (slot.rounded) out.push(slot.rounded);
    }
  }
  out.push(...EXTRA_VOWELS);
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
