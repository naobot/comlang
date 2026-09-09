-- Adds the phonemic ground truth for a lemma, now that `lemma` itself is being
-- reinterpreted as the orthographic (written) form once a real orthography exists (0031).
--
-- `underlying_phonology` is a plain nullable text column, not a structured type: it holds
-- a slash-delimited phonemic transcription (e.g. `/miŋɡɰem/`) using the project's own IPA
-- symbols, the same convention `phonemes.ipa` uses elsewhere. Blank-is-null, matching the
-- lexicon's own convention for `gloss`/`notes` rather than the corpus's not-null-default-''
-- one, since this is prose-shaped data on the same table as those two.
--
-- This migration adds the column only. The one-off backfill deriving it (and re-rendering
-- `lemma` from it through the orthography added in 0031) was run as a data migration
-- against the live project, not as SQL checked into this file, because it required real
-- IPA/orthography logic (digraph-to-phoneme conversion, syllabification for the
-- position-sensitive spelling rules) that has no other home in the schema.

alter table public.lexicon_entries
  add column underlying_phonology text;

comment on column public.lexicon_entries.underlying_phonology is
  'Phonemic transcription in /slashes/, using the project''s own IPA symbols. Distinct '
  'from `lemma`, which is the orthographic (written) spelling once the project has an '
  'orthography (0031, 0033 backfill).';
