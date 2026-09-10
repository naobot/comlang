# xenic tooling

Everything under this directory is **hard-coded to one project — xenic** — and is not
meant to run against any other conlang. It assumes that project's phoneme inventory,
orthography, entry-key conventions and upstream source files, and several of the scripts
name the live project outright:

- Supabase project `mwvocncnozqcapezylio`, project row
  `0431e13e-72f9-4ad6-9c20-f54a65cc6ed6`
- the sibling harness repo `../../../xenolinguistics-harness`, whose
  `packages/own-conlang/grammar.yaml` is xenic's real, validated model

Its data lives beside it in `data/xenic/` — `seed/` for the documents loaded into the
project, `exports/` for the frozen snapshots handed to the harness.

## The one-way rule

**`scripts/xenic/**` may import from `src/lib/`. Nothing in `src/` may import from here.**

`src/` is the app, and it serves every project; the moment one conlang's facts are
reachable from it they start applying to all of them. That is the whole reason this
directory exists. An oxlint `no-restricted-imports` rule in `vite.config.ts` enforces the
ban; the `.ts` files here reach `src/lib` by **relative** path (`../../src/lib/…`) because
the `@/` alias is a Vite alias and `tsconfig.node.json`, which type-checks `scripts/**`,
has no `paths` mapping.

If something here turns out to be genuinely general, the way to promote it is to move the
*rules* into the project's own `project_morphology.spec` document (migration 0029) and the
*engine* into `src/lib` reading them from there — not to import this code.

## Contents

| | |
|---|---|
| `import-lexicon.ts` | Reads the harness's `grammar.yaml`, writes `data/xenic/seed/lexicon.json`. `pnpm xenic:import-lexicon` |
| `import-word-classes.ts` | Same source → `data/xenic/seed/word-classes.json`. Carries hand-transcribed class/category knowledge. `pnpm xenic:import-word-classes` |
| `export-snapshot.ts` | Turns a committed raw dump into `xenic-grammar.yaml` and the three CSVs. `pnpm xenic:export-snapshot` |
| `orthography/` | The forward spelling deriver (`derive.py`) and the corpus re-renderer built on it. Python, no dependencies, not npm-wired — see its own README. |

`orthography/derive.py` and `orthography/rerender_corpus.py` **must stay siblings**: the
second finds the first with `sys.path.insert(0, dirname(__file__))`.
