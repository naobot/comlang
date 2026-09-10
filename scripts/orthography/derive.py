# -*- coding: utf-8 -*-
"""
Forward orthographic derivation for the **xenic** project: given a phonemic string
(`lexicon_entries.underlying_phonology`, or a concatenation of morpheme phonologies),
produce the written form per the project's orthography.

Why this exists
---------------
The 0033 lexicon backfill re-rendered `lemma` from `underlying_phonology` with a
one-off script that was never checked in (see 0033's migration comment). The
orthography has changed since (0034 simplified the rules; graphemes q->gk, x->kh
and the intervocalic-/ŋ/ and /h/-gemination rules were added). This is a committed,
re-runnable implementation of the *current* standard, so the lexicon and corpus can
be re-derived whenever the orthography moves again.

It is deliberately a standalone script, not a `src/lib` module: the rules,
graphemes and phonotactic constraints below are **hard-coded from the live xenic
project as of 2026-09-10**, not read from the database. A project-agnostic version
belongs in `src/lib/orthography.ts` if one is ever needed.

The pipeline
------------
1. tokenize the phonemic string into inventory phonemes (`t͡s` is one token);
2. syllabify against the `maximal` template `(C)(A)V(C)` with maximal onset, where
   A = {j l ɾ w} and the coda is restricted to {p t k m n ŋ l s};
3. apply the position-sensitive rules while mapping phonemes to graphemes.

Graphemes (phoneme -> written), from `orthography_graphemes`:
    a b d e h i k l m n o p s t u w  -> themselves
    ɡ->g   ŋ->ng   ɾ->r   t͡s->ts   j->i   q->gk   x->kh

Ordered rules, from `orthography_rules`:
  0. /j/,/w/ in the onset:
       /j/ -> <y>  when it is the ONLY onset of its syllable, or the nucleus is /i/;
             <i>  as the second member of an onset cluster otherwise.
       /w/ -> <w>  when it is the only onset, or the nucleus is /u/;
             <u>  as the second member of an onset cluster otherwise.
  1. intervocalic /ŋ/: /ŋ/ -> <ngg> when it is the sole onset of a NON-initial
       syllable and the preceding syllable has no coda (a vowel sits on each side).
  2. /h/ after a consonant: an onset /h/ immediately after a coda consonant in
       {p t s k l} doubles that consonant in writing and is itself dropped.

Phonotactic constraints that shape syllabification, from `phonotactic_constraints`:
  - coda is restricted to {p t k m n ŋ l s};
  - no A+A onset cluster;                         (approximants: j l ɾ w)
  - /ŋ/,/t͡s/ + /j/,/l/,/ɾ/ is not an onset;       (but /ŋw/, /t͡sw/ ARE)
  - /h/,/x/ + /l/,/ɾ/ is not an onset;
  - /q/ + any approximant is not an onset;
  - /nj/ is NOT taken as a complex onset unless nothing else parses (word-initial,
    or where the /n/ cannot be a coda). This one is inferred from the lexicon
    (`dinjo`->dinyo, `minja`->minya, `konjaŋ`->konyang) rather than from a written
    rule; it is the only non-obvious choice in here.

Validation
----------
Run against all 648 xenic lexicon entries (2026-09-10): 632 reproduced the stored
`lemma` exactly; 16 stale glide spellings were corrected in the DB from this
output; 6 are legitimately underivable and were left alone
(`e_dir`/`e_ind`/`e_rel` are vowelless clitics, `g_command` has no phonology,
`n_germany` /dot͡slaŋ/ has an unsyllabifiable /t͡sl/, `n_ingredient5` has an
ambiguous /nj/ split).

Usage
-----
    python3 derive.py LEXICON.json
where LEXICON.json is [{"k": entry_key, "lem": stored_lemma, "up": "/…/"}, …].
Prints MATCH / CHANGED / FLAGGED and writes `derive_changes.json` beside the input.
Import it (`from derive import derive`) to re-use the engine — `derive("/…/")`
returns `(written_form | None, notes, syllabification_string)`.
"""
import json
import sys
import os

V = set("aeiou")
APPROX = set(["j", "l", "ɾ", "w"])
CODA_OK = set(["p", "t", "k", "m", "n", "ŋ", "l", "s"])
HGEM_AFTER = set(["p", "t", "s", "k", "l"])          # rule 2: "confirmed for /p t s k l/"
TOKENS = ["t͡s", "a", "b", "d", "e", "ɡ", "h", "i", "j", "k", "l", "m",
          "n", "ŋ", "o", "p", "q", "ɾ", "s", "t", "u", "w", "x"]
BASE_G = {"a": "a", "b": "b", "d": "d", "e": "e", "ɡ": "g", "h": "h", "i": "i",
          "j": "i", "k": "k", "l": "l", "m": "m", "n": "n", "ŋ": "ng", "o": "o",
          "p": "p", "q": "gk", "ɾ": "r", "s": "s", "t͡s": "ts", "t": "t",
          "u": "u", "w": "w", "x": "kh"}


def tokenize(s):
    """Phonemic string (with or without /slashes/) -> (token list, None) or (None, bad char)."""
    s = s.strip()
    if s.startswith("/"):
        s = s[1:]
    if s.endswith("/"):
        s = s[:-1]
    s = s.strip()
    out, i = [], 0
    while i < len(s):
        for tk in TOKENS:
            if s.startswith(tk, i):
                out.append(tk)
                i += len(tk)
                break
        else:
            return None, s[i]
    return out, None


def legal_complex_onset(c1, c2):
    """Is `c1 c2` a permitted (C)(A) onset cluster?"""
    if c2 not in APPROX:
        return False
    if c1 in APPROX:
        return False                                    # no A+A
    if c1 in ("ŋ", "t͡s") and c2 in ("j", "l", "ɾ"):
        return False
    if c1 in ("h", "x") and c2 in ("l", "ɾ"):
        return False
    if c1 == "q":
        return False
    if c1 == "n" and c2 == "j":
        return False                                    # /nj/ dispreferred; see module doc
    return True


def split_cluster(cl):
    """A medial consonant run -> (onset of the following syllable, coda of the preceding),
    by maximal onset. Returns (None, reason) if it cannot be split legally."""
    k = len(cl)
    if k == 0:
        return [], []
    if k == 1:
        return [cl[0]], []
    if legal_complex_onset(cl[-2], cl[-1]):
        rest = cl[:-2]
        if len(rest) == 0:
            return [cl[-2], cl[-1]], []
        if len(rest) == 1 and rest[0] in CODA_OK:
            return [cl[-2], cl[-1]], [rest[0]]
    rest = cl[:-1]
    if len(rest) == 0:
        return [cl[-1]], []
    if len(rest) == 1 and rest[0] in CODA_OK:
        return [cl[-1]], [rest[0]]
    if cl[-2:] == ["n", "j"]:                            # forced /nj/ onset, last resort
        pre = cl[:-2]
        if len(pre) == 0:
            return ["n", "j"], []
        if len(pre) == 1 and pre[0] in CODA_OK:
            return ["n", "j"], [pre[0]]
    return None, "medial cluster /%s/ not splittable" % "".join(cl)


def initial_onset_ok(o):
    if len(o) <= 1:
        return True
    if len(o) == 2 and (legal_complex_onset(o[0], o[1]) or o == ["n", "j"]):
        return True
    return False


def syllabify(toks):
    """Token list -> (list of {onset, nucleus, coda}, None) or (None, reason)."""
    nuclei = [i for i, t in enumerate(toks) if t in V]
    if not nuclei:
        return None, "no vowel nucleus"
    sylls, prev_end = [], 0
    for idx, npos in enumerate(nuclei):
        cluster = toks[prev_end:npos]
        if idx == 0:
            onset = list(cluster)
            if not initial_onset_ok(onset):
                return None, "initial cluster /%s/" % "".join(onset)
        else:
            onset, coda_prev = split_cluster(cluster)
            if onset is None:
                return None, coda_prev
            sylls[-1]["coda"] = coda_prev
        sylls.append({"onset": list(onset), "nucleus": toks[npos], "coda": []})
        prev_end = npos + 1
    tail = toks[prev_end:]
    if tail:
        if len(tail) == 1 and tail[0] in CODA_OK:
            sylls[-1]["coda"] = list(tail)
        else:
            return None, "final cluster /%s/" % "".join(tail)
    return sylls, None


def render(sylls):
    """Syllable list -> (written form, notes)."""
    notes = []
    flat = []
    for si, s in enumerate(sylls):
        for ph in s["onset"]:
            flat.append({"ph": ph, "role": "onset", "si": si})
        flat.append({"ph": s["nucleus"], "role": "nucleus", "si": si})
        for ph in s["coda"]:
            flat.append({"ph": ph, "role": "coda", "si": si})

    # rule 2: onset /h/ right after a coda consonant in {p t s k l} -> double it, drop the h
    out = []
    for e in flat:
        if (e["ph"] == "h" and e["role"] == "onset" and out
                and out[-1]["role"] == "coda" and out[-1]["ph"] in HGEM_AFTER):
            out[-1]["double"] = True
            notes.append("h-gemination /%sh/" % out[-1]["ph"])
            continue
        out.append(dict(e))
    flat = out

    # "sole onset" is judged on the ORIGINAL onset, before any /h/ elision above,
    # so an elided /Chj-/ still spells its glide as a cluster member (littiek, bappiu).
    orig_sole = {si: len(sylls[si]["onset"]) == 1 for si in range(len(sylls))}
    coda_empty_prev = {si: (si >= 1 and len(sylls[si - 1]["coda"]) == 0)
                       for si in range(len(sylls))}

    res = []
    for e in flat:
        ph, role, si = e["ph"], e["role"], e["si"]
        if role in ("nucleus", "coda"):
            g = BASE_G[ph]
            res.append(g + g if e.get("double") else g)
            continue
        nx = sylls[si]["nucleus"]
        if ph == "j":
            res.append("y" if (orig_sole[si] or nx == "i") else "i")
        elif ph == "w":
            res.append("w" if (orig_sole[si] or nx == "u") else "u")
        elif ph == "ŋ":
            res.append("ngg" if (orig_sole[si] and si >= 1 and coda_empty_prev[si]) else "ng")
        else:
            res.append(BASE_G[ph])
    return "".join(res), notes


def derive(up):
    """Phonemic string -> (written form | None, notes list, 'syl.la.ble' string | None).

    A `.` in the input is an explicit syllable boundary the conlang designer wrote in
    (not a phoneme): the string is split on it and each part syllabified on its own, so
    the marked split -- e.g. `soŋ.wo` (-> "songwo") vs `so.ŋwo` (-> "songuo") -- is what
    is rendered instead of maximal onset guessing.
    """
    parts = [p for p in up.strip().strip("/").split(".") if p.strip()]
    if len(parts) > 1:
        sylls = []
        for part in parts:
            toks, bad = tokenize(part)
            if toks is None:
                return None, ["unknown segment %r" % bad], None
            part_sylls, err = syllabify(toks)
            if part_sylls is None:
                return None, [err], None
            sylls += part_sylls
    else:
        toks, bad = tokenize(up)
        if toks is None:
            return None, ["unknown segment %r" % bad], None
        sylls, err = syllabify(toks)
        if sylls is None:
            return None, [err], None
    written, notes = render(sylls)
    ss = ".".join("".join(s["onset"]) + s["nucleus"] + "".join(s["coda"]) for s in sylls)
    return written, notes, ss


if __name__ == "__main__":
    path = sys.argv[1]
    rows = json.load(open(path))
    match, changed, flagged = 0, [], []
    for r in rows:
        up = (r.get("up") or "").strip()
        stored = r.get("lem") or ""
        if not up:
            flagged.append((r["k"], stored, "no underlying_phonology", ""))
            continue
        d, notes, ss = derive(up)
        if d is None:
            flagged.append((r["k"], stored, "FLAG: " + "; ".join(notes), up))
        elif d == stored:
            match += 1
        else:
            changed.append((r["k"], stored, d, up, ss, "; ".join(notes)))
    print("MATCH %d / %d   CHANGED %d   FLAGGED %d"
          % (match, len(rows), len(changed), len(flagged)))
    print("\n--- FLAGGED (leave as-is) ---")
    for k, s, why, up in flagged:
        print("  %-16s stored=%-14s %-42s %s" % (k, s, why, up))
    print("\n--- CHANGED (stored -> derived) ---")
    for k, s, d, up, ss, notes in changed:
        print("  %-16s %-16s -> %-16s  up=%-14s syl=%-18s %s" % (k, s, d, up, ss, notes))
    dest = os.path.join(os.path.dirname(os.path.abspath(path)), "derive_changes.json")
    json.dump([{"k": k, "old": s, "new": d} for k, s, d, _u, _y, _n in changed],
              open(dest, "w"), ensure_ascii=False, indent=1)
    print("\nwrote", dest)
