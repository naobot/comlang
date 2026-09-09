# xenic snapshot — 2026-09-10

A frozen dump of the live `xenic` comlang project (Supabase `mwvocncnozqcapezylio`,
project row `0431e13e-72f9-4ad6-9c20-f54a65cc6ed6`), and the flat files derived from it
for the xenolinguistics harness's **Phase 0.5** fifth leg.

## Files

| file | what |
|---|---|
| `raw/structural.json` | phonemes, phoneme classes, syllable template + slots, phonotactic constraints, word classes, grammatical categories, orthography graphemes + rules, the `project_morphology` spec, and the corpus — pulled via Supabase MCP |
| `raw/lexicon.json` | all 637 `lexicon_entries` rows (`entry_key`, `lemma`, `underlying_phonology`, `gloss`, `word_class`, `notes`) |
| `xenic-grammar.yaml` | `grammar.yaml`-shaped document — `toGrammarYaml` of the dump. `lemma` is the **written** form; each entry also carries `underlying` (`/slashes/`). Orthography and the morphology spec are under their own keys. |
| `xenic-lexicon.csv` / `xenic-lexicon-full.csv` / `xenic-corpus.csv` | the CSV exports |

## Regenerating

The `raw/` dump is produced out-of-band (SQL editor / MCP) and committed. The transform
from it is deterministic:

```
pnpm export:xenic     # scripts/export-xenic-snapshot.ts, reads raw/, writes the rest here
```

For a later snapshot: make a new `exports/xenic-<date>/raw/` dump and bump `DATE` in the
script.
