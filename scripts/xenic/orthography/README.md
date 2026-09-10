# Orthographic derivation (xenic)

Turns phonemic strings into written forms per the **xenic** orthography, and uses
that to keep `lexicon_entries.lemma` and `corpus_entries.conlang` spelled to the
standard whenever the orthography or the underlying phonology changes.

This is checked-in, re-runnable equivalent of the one-off script behind the 0033
lexicon backfill (which was never committed — see 0033's migration comment). It is
plain Python with no dependencies; it is **not** a `src/lib` module because the
graphemes, rules and phonotactic constraints are hard-coded from the live project
(snapshot **2026-09-10**), not read from the database.

## Files

| file | what it does |
|---|---|
| `derive.py` | the engine: `derive("/pjil/") -> ("pyil", notes, "pjil")`. Run directly on a lexicon dump to see what `lemma` would change. |
| `rerender_corpus.py` | segments each corpus word into lexicon morphemes, concatenates their phonology, and runs it through `derive()` so cross-morpheme rules fire. |

## The standard it encodes

Graphemes: identity, plus `ɡ→g  ŋ→ng  ɾ→r  t͡s→ts  j→i  q→gk  x→kh`.

Rules (ordered):
1. **/j/, /w/ in the onset** — a glide that is the sole onset of its syllable (or
   sits before its "own" vowel, `/i/` for `/j/`, `/u/` for `/w/`) is written
   `y`/`w`; as the second member of an onset cluster otherwise it is `i`/`u`.
2. **intervocalic /ŋ/** — sole onset of a non-initial syllable with a vowel on each
   side (no coda before it) → `ngg`. This is what turns the topic enclitic `-ngom`
   into `-nggom` after a vowel-final host.
3. **/h/ after a consonant** — an onset `/h/` right after a coda `/p t s k l/`
   doubles that letter and drops the `h`.

Syllabification is maximal-onset against `(C)(A)V(C)` (A = `j l ɾ w`, coda ⊆
`p t k m n ŋ l s`), with the `phonotactic_constraints` on onset clusters. One
non-obvious call: `/nj/` is **not** taken as a complex onset unless nothing else
parses — inferred from `dinjo→dinyo`, `minja→minya`, `konjaŋ→konyang`, not from a
written rule.

A `.` in the phonemic string is an **explicit syllable boundary** the conlang
designer marks in (`soŋ.wo` → "songwo", `so.ŋwo` → "songguo"). When present it is
split out and each part syllabified on its own, so the marked division is what gets
rendered instead of maximal onset guessing. `src/lib/lemmaPhonotactics.ts` reads it
the same way — the phonotactics check validates the marked split and never flags
`.` as an unknown character.

## Runs so far

**Lexicon (2026-09-10)** — `python3 derive.py lex.json` over all 648 entries:
632 already matched, 16 stale glide spellings corrected in the DB, 6 left alone
(`e_dir`/`e_ind`/`e_rel` vowelless clitics; `g_command` has no phonology;
`n_germany` `/dot͡slaŋ/` unsyllabifiable `/t͡sl/`; `n_ingredient5` ambiguous `/nj/`).

**Corpus (2026-09-10)** — `python3 rerender_corpus.py lex.json corpus.json`:
87 of 91 rows re-rendered from the broad phonemic transcription they were written
in. 4 rows still contain a flagged token, left untouched:
`qewu…` (`/qe/` "red" is not in the lexicon and is phonotactically illegal —
a_red is `/ɡwe/`), `jonside` ("Jones", a proper name), `motobajik…`
("motorcycle" — lexicon has `dusaju`), `kjaritsil…` ("bathroom" — `tsil` is
not a known morpheme).

## Re-running

Dump `lex.json` as `[{"k":entry_key,"lem":lemma,"up":"/…/","wc":word_class}, …]`
and `corpus.json` as `[{"id":uuid,"kind":…,"en":english,"con":conlang}, …]` from
the xenic project, then run the scripts. Each writes a `*_changes.json` next to its
input; apply those with a guarded `UPDATE … WHERE id = … AND <col> = <old>` so a
drifted row is a no-op. If the orthography tables themselves change, update the
constants at the top of `derive.py` to match.
