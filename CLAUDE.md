# comlang — notes for future sessions

Collaborative conlang management: two users (owner + collaborator) editing one conlang,
Vue 3 + Pinia + Vue Router on Supabase (Postgres + Auth + RLS + Realtime).

**Sibling repos, each with its own `.git`** — `/Users/nao/code/xenolinguistics/` is not
itself a repo:

- `../xenolinguistics-harness` — the eval harness. **`packages/own-conlang/grammar.yaml`
  is the real, validated model of the conlang** and is what the linguistic core schema
  should be derived from when it is designed. Read it before proposing tables.
- `../conlang/docs` — the co-designer's Notion export (`overview.md`, two vocab CSVs).
- `../project-wiki-web` — the write-up site. React, not Vue; useful only as the
  precedent for this repo's toolchain choices.

## What exists, and what deliberately does not

Built: the **access layer** (`projects`, `project_members`, RLS), auth, the dashboard,
the project workspace *shell* — a navy-on-white header with the conlang name and a gear
menu at the left, section tabs across the middle, and the app name at the right — and the
first six linguistic-core sections: the **phoneme inventory**, **phonotactics**, **word
classes**, the **lexicon** (seeded with the 60 entries from `grammar.yaml`), **grammar
rules**, and the **corpus**.

**Only Orthography is hidden from the header** — dropped from `projectTabs` in
`src/router/index.ts` while its route stays live, so a saved link still resolves and
re-showing it is one line. It is where romanization goes once there is one; upstream has
none. (Note the commit that "hid the two unbuilt tabs" only ever removed Orthography —
word classes stayed in `projectTabs` and rendered the placeholder until it was built.)

**Word classes models classes and categories, and deliberately not morpheme order.** The
first design was tabled because the obvious model — a class owns an ordered chain of slots
— is one the source resists in five places: `phonological_word` splits a nominal template
across a word boundary, `semantic_particle` occupies the case slot instead of a case
marker, plural is reduplication rather than an affix, evidentiality is a final coda rather
than a full morpheme, and `categories` does not line up with `closed_class`. What 0019
builds is the part grammar.yaml states outright — which classes exist, open or closed, and
which categories each inflects for — and the page says in prose what it is not modelling,
so it does not read as a complete account of the morphology.

**Grammar rules is free text apart from `name` and `rule_order`.** The field names match
grammar.yaml's own (`effect`, `environment`, `examples`, `notes`) so tightening later is a
rename rather than a re-parse. Not modelled yet: the SPE-style `formal_source`, and the
provenance split across `inferred` / `confirmed_by` / `fitted_to` / `attested` /
`contradicted_by` — two distinct evidence relations that want their own table. Each needs its own design pass — those tabs render
`SectionPlaceholderView.vue`; they are placeholders, not stubs waiting to be filled in
blind. Also deferred: changelog/version history, and any public/private flag.

## Gotchas that will otherwise be rediscovered as bugs

**The YAML exporter emits by hand, and flow context is where it bites.** `yaml` is a
devDependency — it must not reach the browser bundle — so `src/lib/exporters.ts` writes
YAML itself. Inside `{...}` or `[...]` a comma is a *separator*, so a gloss like
"exist, there is" emitted bare parses **without error** into a mapping with a spurious
`there is:` key. Silent corruption, and it survived the first round of unit tests because
the fixture had no commas; exporting the real project found it in seconds. `yamlScalar`
takes a `flow` flag for exactly this, and the tests round-trip through the real parser
rather than asserting on substrings.

**Import is the lexicon's one whole-file write, and `import_lexicon` (0021, 0027) is where
its rules live.** Everything else on that page saves per entry; an import is one act over
many rows, and a file half-applied is worse than one refused.

- **Matching is on `entry_key` only, never on lemma.** The language has homographs — `gwan`
  is both "meaning" (noun) and "become" (verb) — which is precisely why `lexicon_entries`
  has no unique constraint on lemma. Matching on it would merge two different words. A row
  with no key is therefore always an insert.
- **`p_fields` says which columns the file actually carried, and only those are written.**
  The two-column export has no gloss column, so treating an absent column as "clear it"
  would empty every gloss in the project on import. Verified live: a `fields: ["lemma"]`
  import renamed a lemma and left its gloss and word class untouched.
- **Nothing is ever deleted by inference.** 0027 added `p_delete_ids`, and the distinction
  it turns on is the whole rule: the function deletes ids it is *handed*, one at a time,
  each of which the user was shown and ticked in the review dialog. It still infers nothing
  from absence — a partial file deletes nothing at all — because that inference is what
  would silently turn an import into a whole-project replace.

`parseLexiconCsv` accepts exactly the two shapes `exporters.ts` writes and reports which it
found. Note the two-column format cannot represent "no key" — `toLexiconCsv` writes the
lemma there instead — so re-importing it gives a previously unkeyed entry a key and adds a
row rather than matching one. That is inherent to the format, not a bug to fix, and it is
why the review dialog lists what is about to be added before anything is written.

**The import is reviewed before it is applied, and the review is where every disagreement
between the file and the lexicon is settled (0027).** It replaced a `window.confirm` that
said "This will add 12 and update 30 entries" — a count, not a description. It could not
say *which* thirty, and in particular could not say that one of them was about to have its
lemma replaced under an existing key, which the old flow did without a word.

`buildMergePlan` in `src/lib/lexiconMerge.ts` sorts the file into conflicts, additions,
unkeyed rows, duplicated keys, entries already identical, and stored entries the file does
not carry; `ImportReviewDialog.vue` renders each as a decision and `resolveImport` turns the
answers back into a payload. Both are pure and unit-tested, with the same `?raw` purity
guard `lexiconImport.ts` has.

- **Resolution is per row, not per field.** A conflict resolved as "keep stored" is simply
  **left out of the payload** — which is why row-level resolution needed nothing from the
  RPC at all. Per-field merging would, since `p_fields` is one list for the whole call.
- **Every default lives in `lexiconMerge.ts`**, behind `decideConflict` / `decideUnkeyed` /
  `decideAbsent`, so the component never restates one. Conflicts default to **take
  imported** (the user just chose that file), unkeyed rows to **add**, absent entries to
  **keep**. A duplicated key has **no default**: `unresolved()` is what disables Import,
  and it is the only thing that does.
- **`tally()` and `resolveImport()` must agree**, and a test pins it. The footer's counts
  are a claim about the payload; if they drift, one of them is lying to the user at exactly
  the moment they press the button.
- **Diffs cover only the columns the file carried.** The two-column export has no gloss, so
  diffing it would both describe a write the RPC will not make and turn every entry in the
  project into a conflict.
- **A key claimed twice in one file no longer refuses the file.** `parseLexiconCsv` used to
  push a blocking problem per offending line, which threw away every good row over a
  question that has an answer. `ParsedRow` carries its spreadsheet `line` so the dialog can
  name the two rows in conflict; `line` is stripped again before the payload is sent.
  What is still blocking there is only what has no second version to choose between: a file
  of the wrong shape, and a line with no lemma.
- **A stored entry with no key at all counts as "not in this file",** since no file can
  ever match it. It is listed with the rest rather than hidden — hiding a row from a list
  headed "not in this file" would make Delete all mean less than it says — and Delete all
  asks a second time before it fires.

The view now renders the outcome and the failure. `lexicon.error` is read into a local ref
at the moment of failure rather than rendered from the store: the entry editor already
renders that same ref, and one message in two places reads as two problems. Before this, an
import refused by the RPC set `error` and the view showed nothing at all — a denied import
looked exactly like a successful one.

**The corpus has two sub-views and one table, and the CSV knows about neither (0025).**
`corpus_entries.kind` is `utterance` or `passage`: the sentence grid and the long-form
passage list are filters on it. The problem it solves is not layout — a grid of two short
columns *reads* as a word list, and collaborators were filling it in like a second lexicon.
So the page opens on Passages, the intro says outright that a word with a definition
belongs in the lexicon, and a passage card is a pair of tall panes with the room already
made rather than a cell that grows from one line.

The kind is **stored, not derived from the text.** Deriving it is tempting — it costs no
schema and survives a round trip for free — and it fails at the only moment that matters:
a passage starts empty and is typed into, so the row would hop out of the view it is being
written in halfway through the first sentence. `setKind` moves a row between views and
takes effect immediately, with no Save, because it changes where an example is edited and
not what it says.

**The CSV is unchanged: `english,conlang`, one file, the whole corpus.** The sub-views are
how it is edited, not a second format. What follows is stated rather than hidden: on import
the kind is *inferred* — a newline on either side, or more than
`CORPUS_PASSAGE_MIN_LENGTH` (240) characters, which is what catches the pasted paragraph
that has no line breaks in it. So exporting a short passage and importing it again brings
it back as an utterance. Same family of loss as the missing key column, one click to
correct, and cheaper than a third column every other tool reading these files would have
to learn. `inferKind` in `src/lib/corpusImport.ts` and the `case` in `import_corpus` are
the same rule written twice; the duplication buys the review dialog's *"3 of them look
long enough to be passages"* before the import runs, and the two must be kept in step.

The two panes of a passage are two blocks of text and are deliberately **not aligned line
by line**. That would need a third representation and a rule for one side having more lines
than the other, which is a design question this round did not answer. Line breaks are
preserved exactly, which is enough to lay a conversation out by hand.

**Otherwise the corpus is still two columns and nothing else, and that is a decision rather
than a starting point.** `corpus_entries` (0022) holds `english`, `conlang` and a `sort_order`. A
gloss line, a grammaticality flag and a link to the rule an example illustrates are all
plausible and all deferred, because each one is a thing to fill in before you are allowed
to write a sentence down, and the value of a notebook is that writing in it is free.

Both columns are `not null default ''`, the opposite of the lexicon's blank-is-null
convention: the editor is a grid, where a cell is empty or it is not, and there is no third
state for "never filled in" to mean. A check constraint keeps out a row blank on *both*
sides. One side alone is allowed on purpose — a sentence awaiting a translation and a
translation awaiting a sentence are both real working states.

`sort_order` exists because `now()` is transaction time: sorting on `created_at` would give
every row of an import one timestamp and read them back in arbitrary order. Same trap the
word-class seed hit. There is no reordering UI yet; the column is there so the order an
import laid down survives.

**`import_corpus` matches on the English sentence (0028), reversing what 0022 and 0025 said
was the whole character of this format.** The CSV is still `english,conlang` and nothing
else, but English is now the key, matched trimmed and exact — the same way `entry_key`
keys a lexicon row — rather than the pair only ever being deduped. That is a deliberate
trade, made when asked for directly, and what it buys is real: a typo in a stored conlang
translation can now be fixed by correcting the CSV and re-importing, landing as an update
instead of a second row beside the original.

**What it costs is stated rather than hidden, because `corpus_entries` still has no
unique constraint on English and still should not** — two examples legitimately sharing an
English gloss is exactly what an alternate phrasing *is*, and this project has six such
pairs. A file can only ever name one row per English key, though, so where two stored rows
share one, only the first the RPC finds (`order by created_at`, so at least deterministic)
is reachable at all; the second falls out of every file's keys and lands in the review
dialog's "not in this file" section, indistinguishable there from a row that was
genuinely dropped. Nothing deletes it on its own — that section still defaults to kept,
same as any row a partial file doesn't mention — but a full-corpus round trip will flag
it on every re-import. `corpusMerge.test.ts` pins the sharper edge of this: **without a
`claimed`-ids set, `buildMergePlan` used to make the second such row vanish from the plan
entirely** — not matched, not listed absent — because `fileKeys.has(key)` is true for
both rows sharing a key even though only one of them was ever actually looked up. That
was a real bug caught before it shipped, not a hypothetical.

`import_corpus` (0028):

- Looks a row's English up among the project's stored rows; a match **updates only
  `conlang`** — English is the key that found the row, so a file cannot change it out
  from under itself, and `kind` is left exactly as it was, since an import updating a row
  should not silently move it between sub-views.
- No match **inserts**, with `kind` inferred the same way it always was (0025) — only for
  a genuinely new row, never for one being updated.
- A row whose English is blank **is never looked up, only ever inserted** — a translation
  waiting for its sentence is a real working state, and there is nothing in it to key on,
  the same reasoning `import_lexicon` applies to a row with no `entry_key`.
- `p_delete_ids` (added in the same migration, on the footing 0027 gave `import_lexicon`)
  deletes ids the review dialog was handed and the user ticked, one at a time, and nothing
  is ever inferred from a file's absence.

Deduplication on the pair is gone with it: a corrected sentence is now a targeted update,
not a second row to be caught by a later re-import.

**The corpus import is reviewed before it is applied, the same dialog shape the lexicon's
(0027) uses and for the same reason — say what a file will do before it does it, rather
than a `window.confirm` giving only a count, with both outcomes rendered inline instead of
in an `alert()`.** `src/lib/corpusMerge.ts` is `lexiconMerge.ts`'s counterpart line for
line: `buildMergePlan` partitions a parsed file into `conflicts` (English matches, conlang
does not — defaulting to *take imported*, the file the user just chose), `duplicates` (one
English claimed twice in the file, blocking Import until resolved, no default), `unkeyed`
(blank English, always added, decided per row), `additions` (a new English, added, no
decision to make), `identical` (a no-op, counted), and `absent` (a stored row the file's
keys never claimed, kept unless deletion is opted into). `decideConflict` / `decideUnkeyed`
/ `decideAbsent` / `decideDuplicate`, `resolveImport`, `tally` and `unresolved` are the
same functions under the same names, doing the same jobs.

What differs from the lexicon is narrow and named in the module comment rather than left
to be discovered: a conflict here has one field to show, not four, since English is the
key and cannot itself change without becoming a different row — so `ImportReviewDialog.vue`
renders a `before`/`after` pair instead of a diff table. And the kind shown on a new row is
a preview of what `import_corpus` will infer for it, not a decision made in the dialog —
`inferKind` and the RPC agree on the same rule for the same brand-new rows, and a row
matched to something already stored keeps that row's own kind untouched, so it carries
none to show.

`ParsedCorpusRow` (in `corpusImport.ts`, which stayed pure parsing — the merge logic lives
in `corpusMerge.ts` now, mirroring the lexicon's own split) carries a `line`, for the same
reason `lexiconImport.ts`'s `ParsedRow` does: so the dialog can say which line a row came
from, not just repeat its text.

What was verified when the corpus import switched to the English key (2026-09-03), as a
**collaborator** against the live project (xenic), via the RPC directly with a crafted
JWT claim rather than through the store — no signed-in session was available here: a fresh
English inserted with the correct inferred kind (one utterance, one passage); a second call
reusing that same English **updated the existing row's id and left its kind untouched**
while changing only `conlang`; `p_delete_ids` removed both rows in one call; a non-member
claim was refused 42501 and inserted nothing; and the project was confirmed back at its
original 72 corpus rows afterward with zero leftover test rows. `get_advisors` showed
nothing new beyond the two documented `create_project` / `add_project_member` warnings.
Not verified live: the `select ... into` picking the *oldest* of two same-English rows
under `order by created_at` — asserted by the SQL, not exercised against real duplicate
rows in this pass.

**The corpus store generalises the lexicon's protections from one open entry to every
visible row.** Every row in `byId` has an entry in `drafts` — `fetchFor` and `upsert` are
the only two places a row arrives and both set the pair together — and the view *reads*
that map rather than calling a materialise-on-demand helper, because creating a draft
during render is a write to the store mid-render. The baseline for row X is `byId.get(X)`,
the row itself: a different type from its draft, so the aliasing bug the lexicon hit cannot
recur. On a realtime event the previous row is captured **before** the map is overwritten,
which is what makes "was this client's cell actually edited?" answerable without any id
bookkeeping.

**The corpus cell is a textarea that grows with its content, with no JavaScript in the
loop.** `.grow` is a 1x1 grid holding the textarea and a hidden `::after` carrying the same
string via `attr(data-value)`, stacked in the same cell: the pseudo-element sets the row
height and the textarea stretches to it. A sentence is the unit of content on that page, so
a fixed-height input scrolling its own single line would hide exactly what the page is for.
Both must share every font and padding declaration or the two heights drift.

**`src/lib/csv.ts` is the CSV parser and quoter, shared.** It lived inside
`lexiconImport.ts` until the corpus needed it; splitting it out rather than importing the
lexicon's module from the corpus's keeps the two sections independent — they share a file
format, not a domain. `exporters.ts` takes `csvField` from there too.

**The export is built from what is saved, never from a draft.** An archive of half-typed
edits is worse than making someone press Save first.

**"Last updated by" is stamped by `security definer` triggers, and that is required.**
`projects` has an owner-only UPDATE policy, so a collaborator editing the lexicon could not
otherwise stamp the project — the trigger would silently update zero rows. Per 0007 the
EXECUTE grant is revoked so a trigger function is not also an RPC endpoint. The header
resolves the user from the already-loaded members rather than querying `profiles` again.

**`grammar_rules.rule_order` is meaning, not presentation.** grammar.yaml's `rule_order`
is a feeding pipeline — plural_reduplication feeds onset_simplification, vowel_harmony
feeds u_lowering — so position is data. It is a column rather than a later migration
because order is cheap to store and unrecoverable once thrown away, and the store's
`canonical()` is order-**sensitive** here where the phonotactics one is not.

That is also why this page saves whole-page rather than per entry like the lexicon:
reordering is inherently multi-row, and a per-rule save could leave the pipeline
half-permuted.

**Drag-to-reorder is one composable, no dependency, and the move buttons stay.**
`src/composables/useDragReorder.ts` wraps the native HTML5 drag events for grammar rules,
word classes, categories and syllable templates. Two things it deliberately is not: native
drag does not fire for the keyboard **or for touch**, so every list keeps its ↑↓ buttons
and the handle is an `aria-hidden` `<span>` rather than a button that would announce itself
as operable and then do nothing; and each list holds its own instance, ignoring a drag it
did not start (`dragging === null`), so dragging a word class over the categories beside it
does nothing rather than something surprising. A row is `draggable` only while its own
handle is held — these rows are mostly inputs, and a permanently draggable row swallows
text selection in them. Dropping *on* an item moves the dragged item to that index, through
the same store function the arrows call, so there is one reordering path and not two.

The classes `.drag-handle` / `.drag-source` / `.drag-target` live in `tokens.css` beside
the base button rule rather than in four scoped blocks: one composable applies them, and
the affordance has to read identically everywhere or it stops being one affordance.

**Reordering has to reach `canonical()`, or the page will not know it is dirty.** Word
classes, categories and grammar rules canonicalise array order directly, so a move is
visible for free. Phonotactics does **not** — `canonicalDraft` sorts templates by name — so
`moveTemplate` renumbers `sort_order` from position, and that renumbering is what makes the
drag register at all. Check this before making any other list reorderable.

**A syllable template's name is editable, so the store addresses templates by index.**
`removeTemplate(name)`, `addSlot(name, …)` and the rest were name-keyed, which was fine
while the name was write-once. It is not an identity once someone can type in it: retyping
"CVC" passes through "CV", and a name-keyed edit would land on the other template. The
`:key` is the index for the same reason — keying on the name remounts the row, and drops
focus, on every keystroke.

Duplicate and blank names are **shown, not prevented**: refusing the keystroke would mean
no name could ever be edited into another's. `draftProblems` in the pure module reports
every problem rather than the first, `save` refuses on it, and the field outlines red
meanwhile. This matters because `save_phonotactics` upserts templates on
`(project_id, name)` — two same-named templates are not an error there, they are one row
where the user wrote two. Same trap `problems()` catches for word classes.

**A draft and its baseline must never be the same object.** The lexicon store held two
`EntryDraft`s and, on adopting a collaborator's version, assigned one object to both — so
every later keystroke mutated the baseline too, `dirty` was pinned to false, and the open
entry silently accepted an overwrite. `baseline` is now the **row**, not a second draft:
different types cannot alias. Watch for this anywhere a store keeps "what I have" beside
"what I started from".

**The lexicon is the one section whose realtime patches the list.** A collaborator adding a
word just appears — a dictionary you must reload is a worse dictionary. Only the entry open
in the editor is held still, and only while it is dirty; a clean draft adopts theirs
silently, and a delete says so rather than blanking the pane. Echo detection needs no
bookkeeping here because `baseline` makes "is this actually different?" answerable directly.

**`lexicon_entries` has no unique constraint on `lemma`, deliberately.** The language has
homographs — `gwan` is both "meaning" (noun) and "become" (verb) in the imported data, and
`exceptions` in grammar.yaml carries "homograph" as a sentinel. Uniqueness is on
`(project_id, entry_key)` and only `where entry_key is not null`.

**`word_class` stayed text after word classes was built, reversing what 0014 expected.**
0014 said it "becomes a foreign key when word classes is designed". It did not, and the
reversal is deliberate: 0012 and 0013 settled the opposite policy in between. A foreign key
would make deleting a class either delete every word in it or be blocked by them, and
neither is right — a class is a label someone is still deciding on. Storing the name lets
the reference dangle, so the entry survives and both pages flag it:
`orphanedClassNames` in `src/lib/wordClasses.ts` drives a red banner on the word-classes
page (with an "add as a class" button that reconnects it) and a red outline in the entry
editor. Verified live: deleting every class left `lexicon_entries.word_class` intact.

The entry editor's field is a `<select>` over the defined classes **once the project has
any**, and falls back to free text with a `datalist` when it has none — a new project must
still be able to write a word down. An orphaned value stays selectable rather than being
silently cleared.

**A generated word can be added to the lexicon from the phonotactics page, and that write
must not go through the editor's open draft.** The sample output's words are buttons;
clicking one opens `AddToLexiconDialog` with the form pre-filled as the lemma and the rest
of the fields empty, because the generator produces a *form* and nothing else. The write is
`lexicon.createEntry`, a second insert path that touches neither `openId`, `draft` nor
`creating`: `startCreating` + `saveOpen` would move the editor's single open draft, so
adding a word from another tab would silently discard an unsaved entry someone left open on
the lexicon page. For the same reason `createEntry` **returns** its error instead of setting
the store's `error` — that ref is rendered by the lexicon's own pane, and a failure here
belongs to the dialog that asked for the write. It still patches `byId`, so the list is
right before realtime gets there.

The dialog says when the lemma is already in the lexicon and adds anyway: homographs are
the reason there is no unique constraint on `lemma`, so this is "did you mean to?" and not
an error. Chips for those forms recede rather than warn.

**Never `structuredClone` a store draft.** It throws `DataCloneError` on a Vue reactive
proxy, and `usePhonotacticsStore().save()` cloned as its first statement — so every save
died before reaching the database, setting no error and showing nothing. Use `cloneDraft`
(a JSON round-trip, exact for this plain-data shape), and note *why* this went unnoticed:
the database, the RPC and the pure module were all verified directly, and the store's own
code path never was. **Exercise the store, not just the layers either side of it.**

**`src/lib/phonotactics.ts` is pure, and that is the whole point of it.** No imports
from `vue`, `pinia`, or the Supabase client — a future word-generator feature imports it
unchanged, and the moment it reaches for the database it stops being reusable and becomes
this page's internals. `phonotactics.test.ts` asserts the import list is empty rather than
trusting the comment; that guard was checked to actually fail when violated.

**Its attempt cap is load-bearing.** An over-constrained grammar — a constraint forbidding
the only nucleus class — has no satisfying word, and an unbounded resample would hang the
tab. `generateWord` returns `{ ok: false, reason }` instead. Keep failure as data.

**`save_word_classes` prunes by name and rebuilds the links, and a failed save changes
nothing.** Classes and categories upsert on `(project_id, name)` so their ids survive a
save that reorders, renames and deletes — verified live. Values and the class/category
links are cleared and rebuilt, because that is what lets a value be renamed. A class naming
a category the payload does not contain **raises** rather than dropping the link silently,
so `removeCategoryAt` and `renameCategory` in the store have to carry the links with them;
that is why neither is a plain splice or a `v-model`.

Note that two classes with the same name in one payload would upsert onto one row rather
than erroring, so `problems()` in `src/lib/wordClasses.ts` is the only thing that catches
it. It returns *every* problem rather than the first, so fixing one does not just reveal
the next.

**Three different echo-detection strategies, deliberately.** `phonemes.ts` tracks the ids it
wrote (`ownWrites`); `phonotactics.ts`, `grammarRules.ts` and `wordClasses.ts` debounce a
re-fetch and *compare* against what they hold; the lexicon compares against `baseline`. The
comparison is provably right rather than approximately right, and it exists because one
phonotactics save writes across five tables at once (word classes, four) where id
bookkeeping would be fragile. Copy the comparison approach for any future multi-table page.

**A slot names a class *and* may name its own segments (0024), and the class is not a
fence.** `syllable_slots.phoneme_ipa` is a nullable `text[]`: `null` means "the whole
class" — the default, what every pre-0024 row reads back as, and what keeps an untouched
slot tracking edits to its class — and a non-empty array is an explicit set. There is no
third state: an empty override is a slot nothing can fill, which is a mistake rather than
something to persist, so `phoneme_ipa_nonempty` refuses it, the dialog's Done is disabled
at zero selected, and an empty array in an RPC payload collapses to `null` through
`array_agg`.

The class stays on the slot because it is doing two other jobs: it is what `CVC` notation
is built from, and a segment generated into a restricted slot still carries that class, so
`forbid_in_role C onset` keeps firing on it. Restricting a slot narrows what it produces;
it does not reclassify what it produced. That is also why the set is *not* required to be
a subset of the class — a divergence is shown rather than prevented, as `C′` in the
notation and an accented count button on the slot row.

Stored as IPA text for the reason 0012 and 0013 gave. `orphanedSlotMembers` finds the
dangling ones (the class editor cannot: a slot's set is its own), `resolveGrammar` filters
it against the inventory exactly as it filters class membership, and `impactOfRemoving`
judges a restricted slot on its own set rather than on its class — a class may still be
full of segments the slot does not allow.

**`save_phonotactics` clears slots before it deletes classes.** `syllable_slots.class_id`
is `on delete restrict` so a class cannot vanish from under a live template — which also
means a legitimate "remove the class and the slots using it" save has to empty the slots
first or it trips its own guard. The ordering inside that function is not incidental.

**Class and template ids survive a save**, because the RPC upserts on the natural key
(`symbol`, `name`) rather than recreating. Slots and constraints reference class ids, so
delete-and-recreate would churn every foreign key on every save. Verified directly.

**A rule's phoneme terms are IPA text, not foreign keys, and that is deliberate.**
0010 made them `references phonemes(id) on delete cascade`, so removing /ŋ/ *deleted* the
rule "ŋ cannot be an onset" — something a person deliberately wrote, gone with nothing to
reconstruct it from. 0012 traded the foreign key for text so the reference is allowed to
dangle, because a dangling reference is what lets the UI show the rule in red rather than
lose it. The database therefore no longer guarantees a rule names a segment that exists;
it cannot, if the rule is to survive. `orphanedTerms` / `orphanedConstraints` in
`src/lib/phonotactics.ts` do that check instead, against the **saved** inventory.

An orphaned rule is inert rather than wrong: the segment is gone from every class too, so
nothing generated can carry it. Inert is a quieter failure than deleted, which is why the
phonotactics page banners it and the constraint list outlines it in red.

Class terms keep their foreign key — deleting a class is an explicit act on the
phonotactics page, where `removeClass` already prunes the rules that used it, so there is
no silent loss to prevent.

**Class membership is IPA text too** (0013), for the same reason. Curating a class is
work, and losing it silently on a phoneme deletion was the same bug wearing different
clothes. `orphanedMembers` finds the dangling ones and the class editor strikes them
through.

**Because a class can now hold a segment the language does not have, `resolveGrammar`
filters members against the inventory.** Without that filter, removing a phoneme would
change the chart and nothing else — the generator would go on producing it. That is the
load-bearing line in the whole orphaning design, and `resolveGrammar`'s tests pin it.

Any future table hanging off `phonemes` needs this decision made deliberately: cascade and
warn, or store the symbol, flag the orphan, and filter it out of anything generative.

**The phoneme inventory inverts the realtime rule: it notifies, it never patches.**
Every other store applies events to its state. `src/stores/phonemes.ts` does not — the
page saves explicitly, so a collaborator's insert landing in the draft would rewrite an
edit in progress and then be written back on Save as if the user had chosen it. Events
set `changedElsewhere`; the user decides whether to reload. Any future
explicit-save section should copy this store, not `projects.ts`.

That store also keeps an `ownWrites` id set, because **a writer receives its own events**
and would otherwise raise "changed by someone else" against its own save. Only ids the
save actually *changed* go in — putting an unchanged row's id there leaves an entry
nothing ever consumes, which then swallows a collaborator's later delete of that row.

**The IPA chart is static data, not a table.** `src/data/ipa.ts` is identical for every
project, so a table would add a join and a fetch for nothing; `phonemes` stores only
which symbols are selected. Its feature labels (place, manner, voicing) are the IPA's
own, a way to find a symbol on a grid — **not a claim about the conlang**, whose notes
deliberately leave voicing and manner underspecified (`conlang/docs/overview.md:10`).
`phonemes.kind` is denormalized rather than derived so downstream SQL can ask for "the
vowels" without the module, and so revising the chart cannot change what a stored row
meant. `src/data/ipa.test.ts` pins the invariants — chiefly no duplicate symbol, since a
duplicate would silently make two chart cells toggle as one phoneme.

**The header menu closes on a delay, and the gap under the trigger is bridged.**
`HeaderMenu` opens on hover and closed on `mouseleave` with no grace period, which made it
a target you had to hit rather than a menu you could reach for — the panel hangs
`--sp-1` below the trigger, so those few pixels belong to neither element and any diagonal
path towards an item left the menu on the way in. Two fixes, and both are wanted: a
`.panel::before` strip spanning the gap so the pointer never leaves the element, and a
300 ms `CLOSE_DELAY_MS` cancelled by re-entry, which covers the paths a bridge cannot
(leaving sideways and coming back). **Only closing is delayed** — a menu that hesitates
before appearing feels broken in a way that one lingering for a third of a second does not.
Verified by dispatching real mouse events at the built app in headless Chrome: it opens on
enter, is still open 60 ms after leaving, is gone by 460 ms, and a re-entry inside the
window cancels the close outright.

**`ModalDialog.vue` is the app's only modal, and it is a native `<dialog>` on purpose.**
`showModal()` gives Escape, the top layer, the inert background and a focus trap for free,
none of which then has to be written or kept correct. The one thing it does not give is
click-outside, which is done by comparing `event.target` against the dialog element — the
panel fills the element, so anything not covered by a child is backdrop. `::backdrop`
inherits nothing from the page, so its colour is restated in the component. Note the panel
takes a **definite** height, not a `max-height`, for the reason the lexicon's list pane
did: its scrolling body is a flex child, and against an indefinite height it resolves to
its full content and spills.

Two things follow from `showModal()` that will otherwise be rediscovered: calling it on an
already-open dialog throws, so the `open` watcher is guarded both ways; and the dialog's
own Done is a `type="submit"` button, so a dialog rendered **inside** a `<form>` submits
that form instead of closing — `ConstraintForm` deliberately renders its picker as a
sibling of the form, not a child.

**The IPA charts take an optional `isAvailable`, which is what lets them be a picker.**
`ConsonantChart` and `VowelChart` were already store-free reference renderers taking
`isSelected`; `isAvailable` narrows them to a subset, which for every caller so far is the
project's own inventory. The consonant table drops rows *and columns* with nothing left in
them — eleven places of articulation holding three symbols is a grid you have to hunt
through — while the vowel chart drops only symbols, because the outline, the rules and the
axis labels **are** the chart and a vowel's meaning is where it sits.

**A constraint is edited beside the draft, never in it.** `ConstraintForm` holds local
refs and the parent commits on `submit`; there is no half-filled constraint in
`draft.constraints` at any point. That is not fussiness: `kind_shape` would refuse one, and
this page saves whole rather than per rule, so a single incomplete constraint would block
every other edit on the page from being saved. The same component is the add row and the
in-place editor, so the two cannot drift.

**Buttons never wrap, and centre their label.** The base rule in `tokens.css` sets
`white-space: nowrap` plus `inline-flex` + `align-items: center`, so a control's label
stays one line and a button stretched by a taller sibling in a flex row keeps its text
centred rather than at the top. Two deliberate opt-outs, both where a `<button>` is really
*content*: `.lemmas button` (a lemma and its gloss, which must wrap) sets
`white-space: normal`, and the "+ Add ⟨search text⟩" button truncates instead, since its
label is arbitrary user input in a fixed-width sidebar. Its ellipsis lives on an inner
`<span>` because `text-overflow` cannot apply to a bare text run inside a flex container.

**The vowel chart is coordinates, not a grid — and the axis labels need explicit
widths.** The first version laid the vowels out in a 4x3 CSS grid and drew a trapezoid
behind it, which put every open and near-open symbol outside the outline it was meant to
sit on, and had nowhere at all for the seven vowels that are not on a major row
(ɪ ʏ ʊ ə æ ɐ) — they ended up in a leftover list underneath. `VOWEL_POSITIONS` now stores
normalized `x`/`y` per position and `vowelPoint` applies the slant, so the symbols and the
SVG outline are drawn from the same function and cannot drift. `x` is backness *within its
row*: `a` and `i` are both `front`, at different absolute x. `ipa.test.ts` pins that.

The labels are positioned by `right`/`left` against a moving edge, and an absolutely
positioned box anchored that way gets no width to grow into — the height labels rendered
as "Cl" and "Near-op", and "Back" (at `left: 100%`) vanished entirely. Both label rules
therefore set an explicit `width`. Symbol pairs are opaque so the rules pass behind them,
which is also why the axis labels need clearance: an overlapping pair paints over them.

**There are two sans faces, and the split is about kind of text, not size or emphasis.**
`--font-ui` (IBM Plex Sans) is everything read as language: body copy, hints, summaries,
warnings, and the value inside a field. `--font-display` (Space Grotesk) is everything that
*names* something: the project name and brand, the tabs, section heads, the consonant
chart's column and row headers, and button labels. `--font-mono` is deliberately untouched
by both — it is what carries the IPA.

The display face is applied **once, by element** — `h1`–`h6`, `th`, `label` and `button` in
`tokens.css` — rather than restated in twenty scoped blocks, because the moment it is a
per-component decision the two faces start appearing in the wrong places. `th` is safe as a
bare element selector: the consonant chart is the only table in the app with header cells.
Weight is 500 everywhere the display face lands, not the browser's bold — the grotesk reads
about a step heavier than the old system stack, so 600 shouts. Tracking is *not* set by
that rule: an uppercase section head wants 0.08em, a 1.25rem title wants none, and the
brand wants 0.10em because it is a wordmark rather than a label.

Two opt-outs follow from it and are easy to miss:

- **A `<label>` carries the face; its contents do not.** `label > *` puts every element
  child back to the UI face at 400 with no tracking or casing — the control is a thing
  someone typed and the `small` under it is a hint, neither of which is the label. The
  selector is exact because a label's own text is a bare text node. A span that genuinely
  *is* the label text (`.pane-label`) overrides it by class.
- **A button that is really content opts out of the face as well as the casing.** The
  existing convention was `text-transform: none`; it now needs `font-family: var(--font-ui)`
  beside it (a menu item, a lemma in the list, an inline link, the modal's close glyph).
  Buttons that already name a face of their own — the phones, terms and symbols, all mono —
  need nothing.

Verified in the built app under headless Chrome: both families load, and on the workspace
shell the tabs, the active tab, the brand and the `Not found` title render in Space Grotesk
while the body copy and links render in IBM Plex Sans.

**Dark mode is a palette swap and nothing else, which is the whole point of the
tokens.** `@media (prefers-color-scheme: dark)` in `src/styles/tokens.css` redefines the
`--c-*` variables and no rule anywhere else is theme-aware. When adding UI, reach for a
token; the one hardcoded colour in the app (the header menu's navy shadow) had to become
`--c-shadow` because it was invisible on near-black.

Three things that are not just "make it darker":
- **`color-scheme: dark` is required**, not decoration. Without it the browser paints form
  controls, scrollbars and the search input's own clear button in light-mode skins on a
  black page.
- **`--c-accent` inverts rather than darkens.** In light mode it is navy: legible as link
  text on white *and* usable as a fill under white. Neither holds for navy on near-black,
  so in dark it becomes pale blue and `--c-accent-text` becomes the page ground. The pair
  is what keeps `button[type="submit"]` readable in both.
- **`--c-surface` stops being identical to `--c-bg`.** In light both are white and borders
  do the separating; in dark, surface is a hair lighter so inputs and the app header lift
  off the page — and the consonant chart's impossible-cell hatch needs the two to differ,
  since it stripes raised against surface.

It follows the system setting; there is no toggle. Adding one means writing the same
tokens under a `:root[data-theme="dark"]` selector too.

**The lexicon fills the viewport; every other section grows with its content.** A
dictionary is a list you scroll *inside*, not a page that gets taller with every word. Its
`section` therefore takes a **definite** height — `calc(100dvh - var(--header-h) -
var(--sp-8) * 2)`, the page's own padding included — and the panes stretch into it and
scroll on their own.

Definite is the load-bearing word. The first version used `max-height` on a sticky
sidebar, and it did not work: `.lemmas` is `flex: 1` inside `.panel`, and against an
*indefinite* height a flex item resolves to its full content height, so the list took its
natural size and spilled straight out of the cap instead of scrolling within it. Grid
children also need `min-height: 0` or they refuse to shrink below their content and the
overflow simply reappears one level down. `min-height: 26rem` on the section is the escape
hatch: below that there is no useful list left, so the window scrolls instead.

**The workspace body runs to 2400px, and each block declares how much of that it can
use.** `ProjectWorkspaceView`'s `.page` was capped at 60rem; the sections are two-pane
editors and dense charts, not prose, so they take the room. But "full width" applied
naively makes a form field a thousand pixels wide, so the blocks that do not benefit cap
themselves: the IPA consonant table at 88rem, grammar rules at 80rem (**one column even
when there is space** — position is the pipeline, and rules flowing into a second column
would make "what feeds what" a reading puzzle), the entry-detail form at 64rem, and every
intro paragraph at 44rem. Word-class cards instead use `repeat(auto-fill, minmax(24rem,
1fr))`, so extra width becomes more cards per row. Add a cap or an auto-fill to any new
block; neither is a default.

**The app chrome is gated on the route, not on there being a user.** `App.vue` renders
`AppHeader` for everything except the login screen. It used to also require `auth.user`,
which was right while every route was behind the auth guard and became wrong the moment
published projects existed: a signed-out visitor got no project name, no tab bar and so no
way to reach any section but the one their link landed on — a whole conlang looking like
one page with a read-only banner over it. The header copes with a missing user itself (the
account menu offers Sign in; Members and Settings are gated on `members.canEdit`), and
`lastBy` returns **null** rather than "someone" when the person cannot be named, so a
visitor — who cannot read the member list — gets "Last updated ⟨when⟩" instead of a
sentence about a stranger.

**A tab page's `<h1>` is `sr-only`, not deleted.** The header tab already names the page,
so rendering it again below was noise — but a page with no `h1` leaves a screen reader with
nothing to announce it by. `ProjectMembers` and `ProjectSettings` keep visible headings:
they hang off the name menu, not the tab bar, so nothing else names them.

**Sections declare dependencies with `meta.requires`.** Phonotactics, word classes,
lexicon, corpus and grammar all carry `requires: "phonemes"`, and `SectionPlaceholderView`
renders a "set up the inventory first" notice instead of the generic placeholder when
the inventory is empty. Soft gate on purpose: the tab stays navigable, so the header
never shows a dead control. `ProjectWorkspaceView` loads the inventory for the same
reason it loads membership — pages that don't own the data still have to ask about it.

**Content is member-editable; owner-only is for settings and membership.** The
`phonemes` policies grant all four verbs to any member. A collaborator who could not
edit the language would have nothing to collaborate on.

**A project can be published, and publishing changes only the read side (0026).**
`projects.is_public` opens every linguistic-core table to `anon` *and* to signed-in
non-members, through one new helper — `private.is_project_visible(project_id)`, which is
member-or-public and is the third of the `private` helpers. The write policies are not
touched and none of them names `anon`.

That last sentence is the whole safety argument, so it is worth stating why: **`anon`
already holds the table-level INSERT/UPDATE/DELETE grants** Supabase gives it by default,
on every table. RLS is the only thing between an anonymous request and a write. It holds
because every write policy is `to authenticated` with a membership check — a future policy
that names `anon`, or that omits the role list entirely, would hand the database to the
internet. Verified from outside with the publishable key: an anonymous insert is refused
42501, an anonymous update matches zero rows, an anonymous delete removes nothing, and
`import_corpus` is refused at the grant.

`anon` is granted `usage` on the `private` schema and execute on **that one function**.
`is_project_member` / `is_project_owner` stay revoked from it, which is why the member
branch is inlined inside `is_project_visible` rather than delegating.

**`project_members` and `profiles` stay member-only, published or not.** Who is working on
a language is not part of the language, and the membership row embeds a profile — so
publishing it would publish email addresses. A visitor therefore sees the conlang and
nothing about the people behind it, and the Members tab says so rather than rendering an
empty list.

**RLS no longer answers "which projects are mine".** It answers "which are visible", which
since 0026 includes every published project in the database. `fetchAll` therefore narrows
with an explicit `project_members!inner` join on the user's id — the membership rows *are*
the authority, and they are readable only to members. The store keeps two maps for the same
reason: merging them would put strangers' languages on someone's dashboard under "your
projects". Realtime routes by the same rule: a **private** row could only have reached this
client if they are a member, so it goes to their own list; a **public** row proves nothing
and goes to the published one.

**Read-only is `members.canEdit`, and it is presentation, never a boundary.** It is
`loaded && currentRole !== null` — false for a signed-out visitor and for a signed-in
stranger alike, and false until membership has actually been fetched, which is why
`ProjectWorkspaceView` now **awaits** that one fetch before rendering: a member watching
their own controls appear a beat late reads as a bug. Each section hides its own write
affordances rather than the workspace disabling everything centrally, because a blanket
`fieldset[disabled]` would also kill the lexicon's entry list, the corpus's sub-view tabs
and every search box — the things a reader most needs. Phonotactics is the one section that
swaps rather than hides: `PhonotacticsSummary` states the classes, templates and
constraints as text, because three editors with their controls removed is mostly empty
boxes. The generator stays live for visitors; it writes nothing.

The routes for `/` and `/projects/:id` dropped `requiresAuth` — what a visitor may see is
RLS's decision, and the workspace already renders "doesn't exist, or you don't have access"
for anything that comes back empty, which is exactly what a private project looks like from
outside.

**Realtime deletes are neither filtered nor authorized.** A subscription filtered to
`project_id=eq.<id>` still receives DELETE events for rows in *every* project, and RLS
is not applied to DELETE at all. With `replica identity full` under RLS, the `old`
record carries **only the primary key**. So `onDelete` in
`src/composables/useProjectChannel.ts` gets a bare id off an unfiltered stream: it must
stay "drop this id if I hold it," and an unknown id must remain a silent no-op. INSERT
and UPDATE *are* filtered and RLS-checked; only deletes are the odd ones out.

**A blocked write is not an error.** RLS filters rows, it does not raise: a
collaborator's `update` on a project simply matches zero rows and returns `null`.
`updateProject` in `src/stores/projects.ts` checks for that and says so, because
otherwise a denied rename looks identical to a successful one.

**`ProjectWorkspaceView` owns the members fetch, not the Members tab.** `members.isOwner`
gates the header's gear menu and the settings form, which exist on every tab — fetching
membership only where the list renders would leave `isOwner` false everywhere else, and
an owner would lose their own controls by navigating. `ProjectMembers.vue` therefore
renders and mutates only; it does not subscribe.

**The router is in history mode, so the host has to serve `index.html` for every path.**
`vercel.json` rewrites `/(.*)` to `/index.html`, and without it a deployed build 404s on
exactly the two things that matter — refreshing a section and opening a link someone
shared. It is not reproducible locally: Vite's dev server and `vp preview` both do this
fallback themselves, so the bug only exists on the host. Vercel's zero-config Vite preset
serves `dist/` as plain static files and adds no catch-all.

Rewrites are evaluated *after* the filesystem check, so `/assets/...` and `/favicon.ico`
still serve their own bytes rather than the shell — verified against the real `dist/` under
a server that mimics that order. The build emits **root-absolute** asset URLs
(`/assets/index-*.js`), which is what lets one `index.html` boot from a URL of any depth;
switching to relative asset paths would reintroduce the bug in a subtler form. A genuinely
unknown path now returns 200 with the app's own "Not found" — that is the normal shape of a
single-page app, not a regression. Any other host needs its own version of this file
(`_redirects` for Netlify, `try_files` for nginx).

**Header tabs are child routes, listed once in `projectTabs`** (`src/router/index.ts`).
`AppHeader` imports that array rather than filtering `router.getRoutes()`; `members` and
`settings` are children too but deliberately absent from it, since they hang off the gear
menu. Adding a linguistic-core section means a child route plus a line in `projectTabs`.

**Subscribe before you fetch.** There is a live window between `SUBSCRIBED` firing and
the binding actually delivering rows; a change made in it is never delivered, at all.
Subscribing first means the follow-up fetch covers that window. Fetching first leaves a
permanent hole between the query returning and the channel attaching. Observed directly:
an insert issued immediately after `SUBSCRIBED` produced no event, while the same insert
a couple of seconds later did.

**Channels are reference-counted, and stores own them — never components.** One row can
appear in several places at once (a lexicon entry in a list and inside a grammar rule
that cites it). Two channels would double-apply every event. Subscribe through
`subscribeToTable` / `subscribeToProjectTable` and release exactly once.

**Writers receive the echo of their own writes.** Every mutation is applied by id
(`byId` map in `src/stores/projects.ts`), never appended, or a create shows up twice.

**RLS policies must not read `project_members` directly.** That recurses. Go through
`private.is_project_member()` / `private.is_project_owner()` — `security definer` with a
pinned `search_path`, which is what breaks the cycle. Every future project-scoped table
reuses them, so its policies are copy-paste.

They live in the **`private` schema, not `public`**, so PostgREST does not publish them
as `/rest/v1/rpc/...` endpoints; the security advisor flags any security-definer
function that is reachable that way. `create_project` stays in `public` because it is
meant to be called over RPC, and its advisor warning is expected. Note that migration
0002 predates this move — copy the policy pattern from 0004.

**`profiles` is the only readable mirror of `auth.users`.** The client cannot query
`auth.users`, so without it there is no way to turn an email into a user id or show a
member list as anything but UUIDs. A trigger keeps it in sync on signup and on email
change. It is **not a directory**: the select policy exposes your own row plus people
you already share a project with, via `private.shares_project_with()`.

`project_members.user_id` carries a second foreign key to `profiles` purely so PostgREST
can embed it — `select("*, profile:profiles(...)")` fails with "could not find the
relation" without it, and the generated types catch that at compile time.

**The registration flow is four pages and no schema (`/login`, `/signup`,
`/reset-password`, `/set-password`).** Everything it needs already existed: GoTrue for the
accounts, and 0006's `on_auth_user_created` trigger to mirror each new user into
`profiles`, which is what lets an owner then invite them by email. Verified live end to
end — sign up returns a session, the profile row appears, `updateUser` changes the
password, the old one is refused and the new one signs in — on a throwaway account since
deleted.

Two settings on the hosted project decide how this behaves, and both were read from
`/auth/v1/settings` rather than assumed: `disable_signup: false` and
**`mailer_autoconfirm: true`**. Autoconfirm is why signing up lands you straight in the
dashboard with no confirmation email. `signUp` still reports whether a session came back
and the view says "check your email" when one does not, so turning confirmations on later
needs no code change. The server's own minimum is 6 characters (confirmed by having one
refused); `src/lib/password.ts` asks for 8, and the server is still the real check.

**`resetPasswordForEmail`'s `redirectTo` must be in the project's allow-list** (Dashboard →
Authentication → URL Configuration) or GoTrue silently falls back to the Site URL and the
link lands on the dashboard instead of the form. That is configuration this repo cannot
carry, and it is per-environment: the deployed origin needs adding as well as localhost.

`SetPasswordView` accepts **three** shapes of recovery URL, because which one arrives
depends on the email template and the client's flow type: a `#access_token=…` fragment
(the implicit flow, which the Supabase client consumes itself on load), `?code=…` (PKCE,
exchanged), and `?token_hash=…&type=recovery` (the newer templates, verified). Anything
else is a used or expired link and says so. The same page is "change your password" from
the account menu — both end in `updateUser`, so there is one form — which is why the guard
deliberately does **not** bounce a signed-in user away from it, unlike `/login` and
`/signup`.

**The auth pages carry `meta.chrome: false`**, and `App.vue` reads that rather than naming
routes. They have their own centred layout via `AuthShell`.

**Adding a member goes through `add_project_member(project_id, email, role)`**, which is
security-definer and checks ownership itself, because the caller cannot see the profile
of someone they do not yet share a project with — which is exactly everyone they are
about to invite. It resolves only existing accounts; there is no invite email — since the
registration flow went in, the person signs up themselves and is then addable by email. Note it
does let an owner discover whether an email has an account.

**Trigger functions must not be grantable.** `sync_profile_from_auth_user` and
`touch_updated_at` had EXECUTE for `anon`/`authenticated`, which published them as RPC
endpoints; 0007 revokes it. Triggers fire as the table owner, so this does not break
them — confirmed by signing a user up afterwards. Do the same for any future trigger
function.

**`projects` has no INSERT policy.** A new project has no members, so a member check
could never pass and an open check would let someone strand an unreadable row. Creation
goes through the `create_project()` RPC, which writes the project and its owner
membership in one transaction.

**Tests import from `vite-plus/test`, not `vitest`.** Vitest is bundled by Vite+ rather
than being a direct dependency, so `from "vitest"` runs but does not type-check, and the
`vite-plus/prefer-vite-plus-imports` lint rule exists to catch exactly this.

**`vp check` does not type-check this project.** tsgolint cannot resolve `.vue` modules
and reports a phantom TS2307 on every SFC import, so `typeAware`/`typeCheck` are off in
`vite.config.ts`. oxlint's `vue` plugin is script-block only — **there is no template
rule in it**. `vue-tsc` is the only thing checking SFC templates; that is why
`pnpm check` runs `vp check` *and* `vue-tsc --build`. Don't "simplify" it to one.

## Database workflow

**There is no local stack** — Docker isn't installed here, so `supabase start` and
`supabase db diff` are both unavailable. Migrations in `supabase/migrations/` are
**written by hand** and pushed to the hosted project:

```
npx supabase link --project-ref <ref>
npx supabase db push
```

Regenerate `src/types/database.ts` with `pnpm gen:types` in the same commit as any
migration that changes a table. That file is generated output — never hand-edit it.
Readable aliases live beside it in `src/types/models.ts`; import `Project` from there,
so a regeneration only has one file to reconcile.

The CLI is not logged in on this machine (`supabase login`, or `SUPABASE_ACCESS_TOKEN`),
so migrations so far were applied through the Supabase MCP tools. Either route is fine;
what matters is that `supabase/migrations/` keeps matching what is actually deployed.

Verify policies in the SQL editor before trusting them, and test the **negative**
direction — that a non-member sees nothing. RLS failures surface as empty result sets,
not errors, so a broken policy looks exactly like an empty database.

What was verified when the access layer went in (2026-09-01), against the live project:
owner sees own project / non-member sees zero rows / non-member cannot self-add /
direct `insert into projects` rejected / owner can add a collaborator / collaborator
then sees the project / collaborator cannot rename or delete it. Over the REST API:
anonymous select returns `[]`, anonymous `create_project` is denied, and
`/rest/v1/rpc/is_project_member` returns 404 because the helpers are not in an exposed
schema. Realtime was confirmed to deliver a full row on UPDATE and **only `{id}` on
DELETE**, as the migration comments claim.

What was verified when the phoneme inventory went in (2026-09-01): as a **collaborator**
(not the owner) `save_phoneme_inventory` inserts, deletes only what was dropped, and
leaves surviving rows' **ids stable** — later tables will reference those ids, so a save
that churned them would be a slow-motion data bug. An empty array clears the inventory;
a non-member is refused with 42501 rather than silently writing nothing; an anonymous
call is refused at the grant. Over Realtime with two signed-in clients: inserts and
deletes both arrive, the delete carrying **only the primary key**, and every event id was
attributable to a save the client had made — which is the premise `ownWrites` rests on.

What was verified when per-slot phonemes went in (2026-09-02), as a **collaborator**
against the live project on a throwaway project since deleted: a save carrying both a
following slot (`null`) and a restricted one round-trips unchanged; a re-save that relabels
the classes and narrows the override keeps class **ids stable**; a direct update setting
`phoneme_ipa = '{}'` is refused with 23514 while the same empty array *in the payload*
lands as `null`; a non-member sees zero slots and is refused 42501 by the RPC; and the
collaborator's write stamped `projects.last_activity_by` despite the owner-only UPDATE
policy. `get_advisors` showed nothing new — only the two documented `create_project` /
`add_project_member` warnings. xenic was confirmed untouched afterwards: 60 lexicon
entries, 23 phonemes, 16 word classes.

What was verified when phonotactics went in (2026-09-01): as a **collaborator**,
`save_phonotactics` writes all five tables in one call; a re-save that relabels a class and
drops another keeps the surviving classes' **ids stable**; a class still referenced by a
slot cannot be deleted directly (`on delete restrict`) while the save that removes both
together succeeds; `kind_shape` rejects a `forbid_sequence` carrying one term; a class
member that is not in the inventory is refused by name. Over PostgREST with two signed-in
clients: the collaborator's save round-tripped, the pure module generated well-formed words
from the read-back grammar with the ŋ-onset constraint holding, and the owner's channel saw
five events — which is what raises the banner.

After 0012 and 0013, re-verified live **through the stores** rather than against the RPC:
building classes, a template and two rules saves and comes back clean (`dirty` false);
`discard` works; and then removing /ŋ/ leaves both rules stored, class C still holding
`p ŋ s`, one orphaned rule and one orphaned member detected, the resolved grammar's C down
to `p s`, and no generated word containing ŋ.

The lexicon seed is generated: `pnpm import:lexicon` reads the harness repo's
`grammar.yaml` and writes `supabase/seed/lexicon.json` (60 entries). It emits a file rather
than writing to the database so the output is reviewable and diffable against upstream and
the script needs no credentials; load it with a one-off insert. `compound_of` and
`lexicalised` are folded into `notes` as prose — a compound is a real relation and deserves
a real column, which this round deliberately did not decide.

What was verified when the lexicon went in (2026-09-01), **through the store rather than
against the RPC**: create, update, delete, a homograph saving, a duplicate key refused with
a readable message. Over realtime with two clients: the list grows live, a clean draft
adopts a collaborator's edit silently, a **dirty draft is held** and banners instead, one's
own save raises no banner, and a delete elsewhere announces itself while keeping the typed
text.

What was verified for export and activity (2026-09-01): a collaborator's write stamps
`projects.last_activity_by` even though they cannot update `projects` directly, and a
delete stamps it too. The exporter was run against the real project's 18 phonemes and 60
lexicon entries and the output re-parsed — which is how the flow-context comma bug was
found.

What was verified when word classes went in (2026-09-02), as a **collaborator** against
the live project: one call to `save_word_classes` writes all four tables (3 classes, 3
categories, 5 values, 4 links); a re-save that reorders, renames, drops a class and drops a
whole category keeps the surviving classes' **ids stable** and rebuilds the links; a class
naming an undefined category is refused with 23503, a non-member with 42501, a blank class
name with 23514 — and after all three failures the section was **still intact**, which is
the transaction guarantee the RPC exists for; an empty payload clears all four tables;
`anon` cannot execute the function while `authenticated` can; and the collaborator's write
stamped `projects.last_activity_by` despite the owner-only UPDATE policy. Crucially,
deleting every class left a lexicon entry's `word_class` untouched — the whole point of it
being text. The seed was then loaded into the real project: 16 classes, 8 categories, 28
values, 17 links, and **all 60 lexicon entries resolve to a defined class** (32 noun / 16
verb / 9 adjective / 3 predicate), so the orphan banner is correctly empty. The exporter
was run over the real seed and re-parsed, with every class description intact.

What was verified when the corpus went in (2026-09-02), as a **collaborator** against the
live project on a throwaway project since deleted: insert, update and delete; a row filled
in on one side only accepted; a row blank on both refused with 23514; `import_corpus`
adding two of five rows and skipping the one already stored, the one duplicated inside the
same file and the one blank on both sides (`{"created":1,"skipped":4}` on a later run);
**re-importing the identical file adding nothing**; a corrected sentence landing as a new
row with the original left intact; `sort_order` continuing from the project's current max
rather than restarting; a non-member seeing zero rows and refused 42501 on both the insert
and the RPC; `anon` refused at the grant; and the collaborator's write stamping
`projects.last_activity_by` despite the owner-only UPDATE policy. `get_advisors` showed
nothing new. xenic was confirmed intact afterwards: 60 lexicon entries, 27 phonemes, 16
word classes.

What was verified when projects could be published (2026-09-02), against the live project
and from **outside the app** with the publishable key, on a throwaway public project since
deleted: anonymously, the published project and its rows are readable while the private
project is invisible; `project_members` and `profiles` return `[]`; an anonymous insert is
refused with 42501, an anonymous update matches zero rows, an anonymous delete removes
nothing (the row was re-read afterwards to confirm), `/rest/v1/rpc/is_project_member` is
404 because the helpers are not in an exposed schema, and `import_corpus` is refused with
"permission denied for function". Flipping `is_public` back to false made all of it
disappear again in the same breath. Both of the store's new queries were exercised over
PostgREST for shape — the `project_members!inner` narrowing and the `is_public=eq.true`
listing — and `get_advisors` reports nothing new. xenic was confirmed untouched afterwards:
558 lexicon entries, 23 phonemes, 38 corpus rows, and still private.

What was verified when the corpus split in two (2026-09-02), against the live project:
0025 applied, `kind` defaulting to `utterance` so all 38 existing rows stayed exactly where
they were and none moved views; the inference `case` run over six samples in SQL agreeing
with `inferKind`'s unit tests on every one, boundary included (240 characters is an
utterance, 241 a passage); `get_advisors` showing nothing new. **Not** re-run as a
collaborator: this round's only RPC change is additive (`import_corpus` now sets `kind` and
returns one extra count), and no signed-in collaborator session was available here — so the
member guard, the import counts and the realtime path are covered by 0022's verification
and by the unit tests, not by a fresh live run.

What was verified when the import review went in (2026-09-03), as a **collaborator**
against the live project on two throwaway projects since deleted: one call to the new
four-argument `import_lexicon` updated one entry, added one and deleted two, returning
`{"created":1,"deleted":2,"updated":1}`; the entry the file did not mention was left
untouched; a `p_delete_ids` carrying an id from **another project the same user is also a
member of** deleted nothing, which is the `project_id` predicate doing its job rather than
RLS; a non-member was refused 42501 and, having raised before the delete, left the row
intact; `anon` was refused at the grant; a follow-up `fields: ["lemma"]` import renamed a
lemma and left its gloss and word class alone, so 0021's `p_fields` rule still holds
alongside the deletes; and the collaborator's import stamped `projects.last_activity_by`
despite the owner-only UPDATE policy. `pg_proc` was checked to hold **one** signature, not
two — the three-argument version is dropped, so there is no way to import without the
review. `get_advisors` showed nothing new beyond the two documented `create_project` /
`add_project_member` warnings. xenic was confirmed untouched afterwards: 559 lexicon
entries, 23 phonemes, 64 corpus rows, 16 word classes.

The word-class seed is generated the same way the lexicon's is: `pnpm import:word-classes`
writes `supabase/seed/word-classes.json`. It combines **two** parts of grammar.yaml that
neither alone answers — the open classes are the distinct `pos` values on the lexicon
entries, the closed ones are the *keys* of `closed_class` mapped to class names by hand
(`case` there is a category whose members are case markers; `numerals` is a class) — plus
`categories` verbatim. It writes explicit `sort_order`s, because a file loaded straight
into the RPC would otherwise land every row at 0 and read back in arbitrary order. Two
inline YAML *comments* carrying real information (`paucal`, declarative `force`) are
transcribed by hand, since `parse` cannot see them.

What was verified when grammar rules went in (2026-09-01), through the store: create,
whole-page save, **reorder persisting across a re-fetch**, ids stable across a save that
reorders and adds and deletes, duplicate and unnamed rules refused with messages a user can
act on, and realtime notifying without touching the draft while one's own save raises no
banner.

`auth.users` rows inserted by hand need their token columns set to `''` rather than
NULL, or sign-in fails with GoTrue's opaque "Database error querying schema".

## Package manager

pnpm, via Vite+ (`vp`), which also manages the Node runtime. Plain `npx`/`npm` fails
with `EBADDEVENGINES` — use `vp install`, `vpr <script>`, or `./node_modules/.bin/<bin>`.
