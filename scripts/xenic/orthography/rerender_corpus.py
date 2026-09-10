# -*- coding: utf-8 -*-
"""
Re-render xenic corpus `conlang` text into the orthographic standard, using the
engine in `derive.py`.

Corpus `conlang` is written in a broad phonemic transcription (the co-designer's
typeable-IPA convention: `g r ng ts` for `ɡ ɾ ŋ t͡s`; `x q j w` kept as phonemes),
with enclitics and compounded stems glued together and NO orthography rules
applied. So `so` + `ngom` is written `songom`, not the correct `songgom`
(intervocalic /ŋ/), and a glide inside an onset cluster is spelled `w`/`j` rather
than `u`/`i`.

Approach: tile each whitespace-delimited word with known morphemes — every lexicon
entry, matched by its phonemic form OR its stored orthographic `lemma`, with stems
allowed to reduplicate — concatenate the pieces' `underlying_phonology`, and run
the whole word through `derive()`. Because the engine sees the whole word, cross-
morpheme effects fire (`-ngom` -> `-nggom` after a vowel; `/h/`-gemination).

Conservative by design: a word that cannot be tiled, or that tiles two ways with
different phonology, is left untouched and reported. Gaps (whitespace, `...`, `?`)
are preserved exactly.

Usage:
    python3 rerender_corpus.py LEXICON.json CORPUS.json
      LEXICON.json : [{"k": entry_key, "lem": lemma, "up": "/…/", "wc": word_class}, …]
      CORPUS.json  : [{"id": uuid, "kind": …, "en": english, "con": conlang}, …]
Writes `corpus_changes.json` ([{id, old, new}, …]) beside CORPUS.json.
"""
import json
import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derive as E

LEX, CORP = sys.argv[1], sys.argv[2]

# word classes whose entries can head a phonological word (vs. bound enclitics)
STEM_WC = {"noun", "adjective", "verb", "adverb", "interrogative", "demonstrative",
           "quantifier", "predicate", "classifier", None}


def typeable(ipa):
    """A phoneme string rendered in the corpus's typeable-IPA convention."""
    return ipa.replace("t͡s", "ts").replace("ɡ", "g").replace("ɾ", "r").replace("ŋ", "ng")


def load_morphemes(lex_path):
    forms, is_stem = {}, {}
    for r in json.load(open(lex_path)):
        # `.` is a syllable-boundary mark in `underlying_phonology`; the corpus glues
        # morphemes together and re-syllabifies the whole word, so drop it here.
        up = (r.get("up") or "").strip().strip("/").replace(".", "")
        if not up:
            continue
        toks, _ = E.tokenize("/%s/" % up)
        if toks is None:
            continue
        stem = r.get("wc") in STEM_WC
        for form in {typeable(up), (r.get("lem") or "").strip()}:
            if not form:
                continue
            forms.setdefault(form, toks)          # first spelling wins; clashes are rare
            is_stem[form] = is_stem.get(form, False) or stem
    return forms, is_stem


FORMS, IS_STEM = load_morphemes(LEX)
FORM_LIST = sorted(FORMS, key=len, reverse=True)


def reduplicant_tokens(stem_tokens):
    """The plural copy: last <=2 syllables of the stem's phonemes (whole word if monosyllabic)."""
    sylls, _ = E.syllabify(stem_tokens)
    if not sylls:
        return list(stem_tokens)
    take = sylls[-2:] if len(sylls) >= 2 else sylls[-1:]
    out = []
    for s in take:
        out += s["onset"] + [s["nucleus"]] + s["coda"]
    return out


REDUP = {f: (typeable("".join(reduplicant_tokens(FORMS[f]))), reduplicant_tokens(FORMS[f]))
         for f in FORMS if IS_STEM.get(f)}


def tilings(word, depth=0, cap=None):
    """Every tiling of `word` into known morpheme pieces (list of ipa-token lists)."""
    if cap is None:
        cap = [0]
    if word == "":
        return [[]]
    if depth > 12 or cap[0] > 20000:
        return []
    cap[0] += 1
    out = []
    for f in FORM_LIST:
        if len(f) > len(word) or not word.startswith(f):
            continue
        for rest in tilings(word[len(f):], depth + 1, cap):
            out.append([FORMS[f]] + rest)
        if f in REDUP:                              # partial-copy reduplication: redup(f) + f
            rs, rt = REDUP[f]
            if rs != f and word.startswith(rs + f):
                for rest in tilings(word[len(rs) + len(f):], depth + 1, cap):
                    out.append([rt, FORMS[f]] + rest)
    return out


def score(pieces):
    return (len(pieces), -min(len(p) for p in pieces))


def render_word(w):
    """(new spelling | None, note). None => leave the token untouched."""
    lw = w.lower()
    parses = tilings(lw)
    if not parses:
        return None, "no tiling"
    by_ipa = {}
    for pieces in parses:
        by_ipa.setdefault("".join(t for p in pieces for t in p), []).append(pieces)
    rendered = {ipa: E.derive("/%s/" % ipa) for ipa in by_ipa}
    good = {ipa: r[0] for ipa, r in rendered.items() if r[0] is not None}
    if not good:
        note = "; ".join(n for n in next(iter(rendered.values()))[1])
        return None, "engine flag: " + note
    distinct = sorted(set(good.values()))
    if len(distinct) > 1:
        return None, "ambiguous: " + " | ".join(distinct)
    return distinct[0], next(iter(good))


def main():
    corpus = json.load(open(CORP))
    word_re = re.compile(r"[A-Za-zŋʔ']+")
    changes, flags, tok = [], [], {}

    for r in corpus:
        s, out, last, cw = r["con"], [], 0, []
        for m in word_re.finditer(s):
            out.append(s[last:m.start()])
            w = m.group(0)
            if w not in tok:
                tok[w] = render_word(w)
            new, note = tok[w]
            if new is None:
                flags.append((r["id"], w, note))
                out.append(w)
            else:
                out.append(new)
                if new != w.lower():
                    cw.append((w, new))
            last = m.end()
        out.append(s[last:])
        ns = "".join(out)
        if ns != s:
            changes.append({"id": r["id"], "old": s, "new": ns, "words": cw})

    produced = {v[0] for v in tok.values() if v[0]}
    already_ok = {w for w, (new, _n) in tok.items() if new is None and w.lower() in produced}

    print("=== changed tokens ===")
    for w in sorted(tok):
        new, note = tok[w]
        if new is not None and new != w.lower():
            print("  %-24s -> %-24s %s" % (w, new, note))
    print("\n=== flagged tokens (left untouched) ===")
    for w in sorted(t for t in tok if tok[t][0] is None and t not in already_ok):
        print("  %-24s %s" % (w, tok[w][1]))
    if already_ok:
        print("\n=== already orthographic (left as-is) ===\n   " + ", ".join(sorted(already_ok)))
    print("\n=== %d / %d rows change ===" % (len(changes), len(corpus)))
    for c in changes:
        print("  -", c["old"])
        print("  +", c["new"])

    dest = os.path.join(os.path.dirname(os.path.abspath(CORP)), "corpus_changes.json")
    json.dump([{"id": c["id"], "old": c["old"], "new": c["new"]} for c in changes],
              open(dest, "w"), ensure_ascii=False, indent=1)
    print("\nwrote", dest)


if __name__ == "__main__":
    main()
