# xenic snapshot — 2026-09-10b

The **second** snapshot taken on 2026-09-10, and the one Phase 1 iteration 1 runs
against. `xenic-2026-09-10/` (taken earlier the same day, from a 2026-09-09 dump) is the
Phase 0.5 baseline and stays frozen — hence the letter suffix rather than a new date.

A frozen dump of the live `xenic` comlang project (Supabase `mwvocncnozqcapezylio`,
project row `0431e13e-72f9-4ad6-9c20-f54a65cc6ed6`), and the flat files derived from it
for the xenolinguistics harness's fifth leg.

## What moved since `xenic-2026-09-10`

| | before | after |
|---|---|---|
| lexicon entries | 637 | 648 (11 added, 0 removed) |
| corpus rows | 80 | 91 (11 added, 13 re-spelled) |
| orthography rules | 4 | 3 |
| written forms (`lemma`) corrected | — | 14 |
| `underlying_phonology` restated | — | 194 |

- **The glide is `/w/`, not `/ɰ/`.** A phoneme-level rename, so every `underlying`
  string carrying it changed; the graphemes map now reads `w: w`.
- **The `onset /ŋ/` rule is gone**, and with it the `<ngw>` spelling it produced
  word-internally. The `intervocalic /ŋ/` rule absorbed the cases it covered and now
  states its own environment precisely — including that a `.` in `underlying_phonology`
  settles an ambiguous syllable division (`/soŋ.wo/` → `songwo` vs `/so.ŋwo/` →
  `songguo`).
- **14 lemmas re-spelled** as a consequence, most of them `ngw` → `ngu` / `nggu`
  (`kiosngwon` → `kiosngon`, `ngwotuowe` → `nguotuowe`, `pwunungwol` → `pwunungguol`)
  plus a handful of glide and gemination fixes (`tswotsan` → `tsuotsan`, `sadwe` →
  `sadue`, `laphyi` → `lappyi`).
- **`rules.ngGemination` is now `rules.gemination`** — `{ from: ng, to: ngg, positions:
  [suffix] }` — so the exported `morphology:` block states the segments the rule
  rewrites instead of implying them by name.

## Files

| file | what |
|---|---|
| `raw/structural.json` | phonemes, phoneme classes, syllable template + slots, phonotactic constraints, word classes, grammatical categories, orthography graphemes + rules, the `project_morphology` spec, and the corpus — pulled via Supabase MCP |
| `raw/lexicon.json` | all 648 `lexicon_entries` rows (`entry_key`, `lemma`, `underlying_phonology`, `gloss`, `word_class`, `notes`) |
| `xenic-grammar.yaml` | `grammar.yaml`-shaped document — `toGrammarYaml` of the dump. `lemma` is the **written** form; each entry also carries `underlying` (`/slashes/`). Orthography and the morphology spec are under their own keys. |
| `xenic-lexicon.csv` / `xenic-lexicon-full.csv` / `xenic-corpus.csv` | the CSV exports |

## Regenerating

The `raw/` dump is produced out-of-band (SQL editor / MCP) and committed. The transform
from it is deterministic:

```
pnpm xenic:export-snapshot 2026-09-10b   # reads raw/, writes the rest of this folder
```

The argument is the folder suffix and defaults to the newest snapshot, so a later dump
needs a new `exports/xenic-<suffix>/raw/` and the same command — no edit to the script.

**Row order in `raw/` follows the 2026-09-10 dump's conventions** so the two diff
cleanly: insertion order (`created_at`) for phonemes and phonotactic constraints,
`sort_order` for classes / word classes / categories / corpus, `entry_key` for the
lexicon, and name order for a word class's category list.
