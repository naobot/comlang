import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs, matching phonotactics.test.ts: this file is type-checked by
// the DOM tsconfig, which has no Node types, and Vite resolves the raw import in both.
import source from "./orthography.ts?raw";

import {
  type Draft,
  canonicalDraft,
  cloneDraft,
  draftProblems,
  duplicateRuleNames,
  orphanedGraphemes,
  unmappedPhonemes,
} from "./orthography";

const emptyRule = (name: string) => ({
  name,
  effect: "",
  examples: "",
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});

describe("cloneDraft", () => {
  it("is a deep copy, not the same object", () => {
    const draft: Draft = { graphemes: [{ phoneme_ipa: "p", grapheme: "p" }], rules: [] };
    const clone = cloneDraft(draft);
    expect(clone).toEqual(draft);
    expect(clone).not.toBe(draft);
    expect(clone.graphemes).not.toBe(draft.graphemes);
  });
});

describe("canonicalDraft", () => {
  it("is insensitive to grapheme order", () => {
    const a: Draft = {
      graphemes: [
        { phoneme_ipa: "p", grapheme: "p" },
        { phoneme_ipa: "a", grapheme: "a" },
      ],
      rules: [],
    };
    const b: Draft = {
      graphemes: [
        { phoneme_ipa: "a", grapheme: "a" },
        { phoneme_ipa: "p", grapheme: "p" },
      ],
      rules: [],
    };
    expect(canonicalDraft(a)).toBe(canonicalDraft(b));
  });

  it("is sensitive to rule order", () => {
    const a: Draft = { graphemes: [], rules: [emptyRule("one"), emptyRule("two")] };
    const b: Draft = { graphemes: [], rules: [emptyRule("two"), emptyRule("one")] };
    expect(canonicalDraft(a)).not.toBe(canonicalDraft(b));
  });

  it("treats a changed grapheme as a change", () => {
    const a: Draft = { graphemes: [{ phoneme_ipa: "p", grapheme: "p" }], rules: [] };
    const b: Draft = { graphemes: [{ phoneme_ipa: "p", grapheme: "b" }], rules: [] };
    expect(canonicalDraft(a)).not.toBe(canonicalDraft(b));
  });
});

describe("duplicateRuleNames", () => {
  it("finds names used more than once, ignoring blanks", () => {
    const draft: Draft = {
      graphemes: [],
      rules: [emptyRule("ng-digraph"), emptyRule("ng-digraph"), emptyRule(""), emptyRule("")],
    };
    expect(duplicateRuleNames(draft)).toEqual(["ng-digraph"]);
  });

  it("is empty when every name is unique", () => {
    const draft: Draft = { graphemes: [], rules: [emptyRule("a"), emptyRule("b")] };
    expect(duplicateRuleNames(draft)).toEqual([]);
  });
});

describe("draftProblems", () => {
  it("flags a blank rule name", () => {
    const draft: Draft = { graphemes: [], rules: [emptyRule("")] };
    expect(draftProblems(draft)).toEqual(["Every rule needs a name."]);
  });

  it("flags duplicate rule names by name", () => {
    const draft: Draft = { graphemes: [], rules: [emptyRule("dup"), emptyRule("dup")] };
    expect(draftProblems(draft)).toEqual(['Two rules are called "dup".']);
  });

  it("is empty for a clean draft", () => {
    const draft: Draft = {
      graphemes: [{ phoneme_ipa: "p", grapheme: "p" }],
      rules: [emptyRule("a")],
    };
    expect(draftProblems(draft)).toEqual([]);
  });
});

describe("orphanedGraphemes", () => {
  it("finds a grapheme naming a phoneme no longer in the inventory", () => {
    const draft: Draft = {
      graphemes: [
        { phoneme_ipa: "p", grapheme: "p" },
        { phoneme_ipa: "ŋ", grapheme: "ng" },
      ],
      rules: [],
    };
    expect(orphanedGraphemes(draft, new Set(["p"]))).toEqual([
      { phoneme_ipa: "ŋ", grapheme: "ng" },
    ]);
  });

  it("is empty when every grapheme's phoneme is still in the inventory", () => {
    const draft: Draft = { graphemes: [{ phoneme_ipa: "p", grapheme: "p" }], rules: [] };
    expect(orphanedGraphemes(draft, new Set(["p"]))).toEqual([]);
  });
});

describe("unmappedPhonemes", () => {
  it("lists inventory phonemes with no grapheme yet", () => {
    const draft: Draft = { graphemes: [{ phoneme_ipa: "p", grapheme: "p" }], rules: [] };
    expect(unmappedPhonemes(draft, ["p", "a"])).toEqual(["a"]);
  });

  it("is empty once every phoneme is mapped", () => {
    const draft: Draft = {
      graphemes: [
        { phoneme_ipa: "p", grapheme: "p" },
        { phoneme_ipa: "a", grapheme: "a" },
      ],
      rules: [],
    };
    expect(unmappedPhonemes(draft, ["p", "a"])).toEqual([]);
  });
});
