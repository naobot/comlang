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

**Import is the lexicon's one whole-file write, and `import_lexicon` (0021) is where its
three rules live.** Everything else on that page saves per entry; an import is one act over
many rows, and a file half-applied is worse than one refused.

- **Matching is on `entry_key` only, never on lemma.** The language has homographs — `gwan`
  is both "meaning" (noun) and "become" (verb) — which is precisely why `lexicon_entries`
  has no unique constraint on lemma. Matching on it would merge two different words. A row
  with no key is therefore always an insert.
- **`p_fields` says which columns the file actually carried, and only those are written.**
  The two-column export has no gloss column, so treating an absent column as "clear it"
  would empty every gloss in the project on import. Verified live: a `fields: ["lemma"]`
  import renamed a lemma and left its gloss and word class untouched.
- **Nothing is ever deleted.** A partial file is a normal thing to import; inferring
  deletions from absence would silently turn an import into a whole-project replace.

`parseLexiconCsv` accepts exactly the two shapes `exporters.ts` writes and reports which it
found. Note the two-column format cannot represent "no key" — `toLexiconCsv` writes the
lemma there instead — so re-importing it gives a previously unkeyed entry a key and adds a
row rather than matching one. That is inherent to the format, not a bug to fix, and it is
why the confirmation states the create/update split before anything is written.

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
the same rule written twice; the duplication buys the confirmation dialog's *"3 of them
look long enough to be passages"* before the import runs, and the two must be kept in step.

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

**`import_corpus` (0022) only ever inserts, because the format has no key column.** The CSV
is `english,conlang` and nothing else, so nothing in a file can say "this is the row you
already have, changed" — the only candidate is the text, and the text is exactly what an
edit changes. Matching on it would be guessing, and a wrong guess overwrites a sentence
somebody wrote. So:

- A row already present **verbatim on both sides** is skipped, which is what makes
  re-importing your own export a no-op rather than a doubling.
- Anything else is added, **including a corrected sentence** — it arrives as a second row
  beside the original. That is inherent to a keyless format, not a bug to fix, and it is
  why the confirmation states the add/skip counts before anything is written.
- Nothing is ever updated or deleted.
- The dedup is **not** narrowed by kind: the same text filed in the other view is the same
  example, and adding it again because it is filed differently would be a doubling.

Deduplication is a courtesy of the import, **not** a constraint on the table: two examples
may legitimately share an English translation, and one conlang sentence may be glossed two
ways. A unique index would reject real data.

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

**Adding a member goes through `add_project_member(project_id, email, role)`**, which is
security-definer and checks ownership itself, because the caller cannot see the profile
of someone they do not yet share a project with — which is exactly everyone they are
about to invite. It resolves only existing accounts; there is no invite email. Note it
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

What was verified when the corpus split in two (2026-09-02), against the live project:
0025 applied, `kind` defaulting to `utterance` so all 38 existing rows stayed exactly where
they were and none moved views; the inference `case` run over six samples in SQL agreeing
with `inferKind`'s unit tests on every one, boundary included (240 characters is an
utterance, 241 a passage); `get_advisors` showing nothing new. **Not** re-run as a
collaborator: this round's only RPC change is additive (`import_corpus` now sets `kind` and
returns one extra count), and no signed-in collaborator session was available here — so the
member guard, the import counts and the realtime path are covered by 0022's verification
and by the unit tests, not by a fresh live run.

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
