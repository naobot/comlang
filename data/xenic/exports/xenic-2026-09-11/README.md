# xenic snapshot — 2026-09-11

The third snapshot, and the one Phase 1 **iteration 2** runs against. `xenic-2026-09-10b/`
(Phase 1 iteration 1) and `xenic-2026-09-10/` (the Phase 0.5 baseline) stay frozen.

A frozen dump of the live `xenic` comlang project (Supabase `mwvocncnozqcapezylio`,
project row `0431e13e-72f9-4ad6-9c20-f54a65cc6ed6`), and the flat files derived from it
for the xenolinguistics harness's fifth leg.

## What moved since `xenic-2026-09-10b`

| | before | after |
|---|---|---|
| lexicon entries | 648 | 651 (3 added, 0 removed) |
| written forms (`lemma`) changed | — | 106 |
| entries given a `gloss` and `word_class` | — | 3 |
| `underlying_phonology` restated | — | 445 |
| corpus rows | 91 | 92 (1 added, 53 re-spelled) |
| orthography rules | 3 | 2 |

- **The lemma changes are mostly de-homographing, not re-spelling.** One sense is moved off
  a form two entries shared: `a_black` `po` → `gkom` leaves `po` to `n_1sg`; `n_animal5`
  `ge` → `tsunguru` leaves `ge` to `n_rain`; `a_grey` and `a_strong` were both `ro` and are
  now `kunet` and `gkang`. A minority are genuine spelling corrections
  (`ngwuhol` → `nguhol`, `bangges` → `banges`, `rungge` → `runge`).
- **The `intervocalic /ŋ/` rule is gone**, leaving two orthography rules (onset `/j/`-`/w/`,
  and `C`+`/h/` gemination). Note this does **not** retire the morpheme-boundary effect:
  `project_morphology.spec`'s `rules.gemination` is untouched and still
  `{ from: ng, to: ngg, positions: [suffix] }`, so `syi` + `-ngom` → `syinggom` still holds
  and the harness parser is unaffected.
- **`underlying_phonology` now carries syllable boundaries.** 324 of the 445 restatements are
  the `.` mark alone; the rest also move a segment (chiefly `/ɡ/` → `/q/` where the written
  form gained `gk`). This is provenance and reaches no scored form. The three new entries
  (`n_bowl`, `n_bug`, `n_jealous`) have not been through that pass and carry no `.` yet.
- **Two lemmas were corrected in the app just before this dump**, having picked up apparatus
  during the pass above: `n_rainbow` `ɡesyip` → `gesyip` (IPA script-g U+0261 for ASCII `g`)
  and `n_organization` `tsusa.wa` → `tsusawa` (a syllable mark). `lemma` is plain ASCII by
  definition and is the form the harness scores; the first would also have failed the
  harness's prompt-hygiene test. No `lemma` in this dump falls outside `[a-z]`.
- `orthography_rules.summary` exists (migration 0036) and is still `null` on both rules, so
  no `summary:` lines appear in the YAML.
- `grammar_rules` is still `null`, so the export emits no `rule_order:` / `rules:` blocks.

## Files

| file | what |
|---|---|
| `raw/structural.json` | phonemes, phoneme classes, syllable template + slots, phonotactic constraints, word classes, grammatical categories, orthography graphemes + rules, the `project_morphology` spec, and the corpus — pulled via Supabase MCP |
| `raw/lexicon.json` | all 651 `lexicon_entries` rows (`entry_key`, `lemma`, `underlying_phonology`, `gloss`, `word_class`, `notes`) |
| `xenic-grammar.yaml` | `grammar.yaml`-shaped document — `toGrammarYaml` of the dump. `lemma` is the **written** form; each entry also carries `underlying` (`/slashes/`). Orthography and the morphology spec are under their own keys. |
| `xenic-lexicon.csv` / `xenic-lexicon-full.csv` / `xenic-corpus.csv` | the CSV exports |

## Regenerating

The `raw/` dump is produced out-of-band (SQL editor / MCP) and committed. The transform
from it is deterministic:

```
pnpm xenic:export-snapshot 2026-09-11   # reads raw/, writes the rest of this folder
```

The argument is the folder suffix and defaults to the newest snapshot, so a later dump
needs a new `exports/xenic-<suffix>/raw/` and the same command — no edit to the script.

**Caveat as of this snapshot:** that pnpm script is `vp exec tsx …`, but `tsx` is not a
declared dependency, so on a clean `pnpm install` it fails with *"Command 'tsx' not found in
node_modules/.bin"*. This snapshot was produced by running the same script under node's own
type stripping instead, with a resolver shim for the extensionless `src/lib` imports. Either
add `tsx` to `devDependencies` or give the script extensioned imports before relying on the
command above.

## Row order in `raw/`

Row order is fixed so two snapshots diff cleanly: **`entry_key`** for the lexicon,
**`sort_order`** for phoneme classes / word classes / categories / corpus, **insertion order
(`created_at`)** for phonemes, and **name order** for a word class's category list.

**Corrected here, and the correction matters:** `xenic-2026-09-10b/README.md` claims
`created_at` also orders the phonotactic constraints. It cannot. `save_phonotactics` and
`save_orthography` rebuild their tables wholesale, so every constraint row shares one
transaction timestamp (and so does every grapheme row) — `created_at` is a constant there,
not a key, and the row ids churn on each save too. Both are therefore sorted by **content**
from this snapshot on: graphemes by `grapheme` then `phoneme_ipa` (which is the order
09-10b happened to land in, so that block is unchanged), and constraints by
`(kind, a, b, seq_position, role)`. That re-sorts the seven constraints once, against
09-10b's arbitrary order; the set is identical and stable from here.
