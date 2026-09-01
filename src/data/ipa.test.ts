import { describe, expect, it } from "vite-plus/test";

import {
  ALL_PHONES,
  MANNERS,
  PHONE_BY_IPA,
  PHONE_ORDER,
  PLACES,
  PULMONIC_ROWS,
  VOWEL_BACKNESSES,
  VOWEL_ROWS,
} from "./ipa";

describe("the IPA reference chart", () => {
  // A duplicate is the failure mode with real consequences: PHONE_BY_IPA silently keeps
  // the last one, and two chart cells would then toggle as if they were one phoneme.
  it("has no duplicate symbols", () => {
    const seen = new Map<string, number>();
    for (const p of ALL_PHONES) seen.set(p.ipa, (seen.get(p.ipa) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("indexes every phone", () => {
    expect(PHONE_BY_IPA.size).toBe(ALL_PHONES.length);
    expect(PHONE_ORDER.size).toBe(ALL_PHONES.length);
  });

  it("keeps every pulmonic row the same width as the place header", () => {
    for (const row of PULMONIC_ROWS) {
      expect(row.cells).toHaveLength(PLACES.length);
    }
    expect(PULMONIC_ROWS).toHaveLength(MANNERS.length);
  });

  it("keeps every vowel row the same width as the backness header", () => {
    for (const row of VOWEL_ROWS) {
      expect(row.slots).toHaveLength(VOWEL_BACKNESSES.length);
    }
  });

  it("never puts a symbol in a cell marked impossible", () => {
    for (const row of PULMONIC_ROWS) {
      for (const cell of row.cells) {
        if (!cell.impossible) continue;
        expect(cell.voiceless).toBeNull();
        expect(cell.voiced).toBeNull();
      }
    }
  });

  // The two the conlang actually needs beyond ASCII. Their absence would not surface
  // until someone tried to enter the real inventory.
  it.each(["ŋ", "ʔ", "j", "w", "a", "i", "e", "u", "o"])("contains %s", (ipa) => {
    expect(PHONE_BY_IPA.has(ipa)).toBe(true);
  });

  it("classifies vowels and consonants correctly", () => {
    expect(PHONE_BY_IPA.get("a")?.kind).toBe("vowel");
    expect(PHONE_BY_IPA.get("ŋ")?.kind).toBe("consonant");
  });
});
