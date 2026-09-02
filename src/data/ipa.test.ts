import { describe, expect, it } from "vite-plus/test";

import {
  ALL_PHONES,
  MANNERS,
  PHONE_BY_IPA,
  PHONE_ORDER,
  PLACES,
  PULMONIC_ROWS,
  VOWEL_HEIGHTS,
  VOWEL_POSITIONS,
  vowelFrontEdge,
  vowelPoint,
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

  // The quadrilateral is a claim about where a symbol sits, so the coordinates are worth
  // pinning: a stray value puts a vowel outside the outline, which is the bug this model
  // replaced a rectangular grid to fix.
  it("keeps every vowel inside the quadrilateral", () => {
    for (const pos of VOWEL_POSITIONS) {
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(1);
      // Not 0: the front edge has slanted in by this height, and x is already absolute.
      expect(pos.x).toBeGreaterThanOrEqual(vowelFrontEdge(pos.y) - 1e-9);
      expect(pos.x).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("slants the front edge and leaves the back edge vertical", () => {
    expect(vowelPoint(0, 0).x).toBe(0);
    expect(vowelPoint(0, 1).x).toBeGreaterThan(0);
    expect(vowelPoint(1, 0).x).toBe(1);
    expect(vowelPoint(1, 1).x).toBe(1);
  });

  // /a/ is open front and /i/ is close front: same backness, so they belong on the same
  // slanted edge even though their x differs. The old rectangular grid could not say so.
  it("puts the front vowels on the front edge at every height", () => {
    const front = VOWEL_POSITIONS.filter((p) => p.backness === "front");
    expect(front.length).toBeGreaterThan(1);
    for (const pos of front) expect(pos.x).toBeCloseTo(vowelFrontEdge(pos.y));
  });

  it("gives every height a distinct position, minor rows included", () => {
    expect(new Set(VOWEL_HEIGHTS.map((h) => h.y)).size).toBe(VOWEL_HEIGHTS.length);
    expect(VOWEL_HEIGHTS.filter((h) => h.major)).toHaveLength(4);
  });

  // These had no cell on the old grid and lived in a leftover list below the chart.
  it.each(["ɪ", "ʏ", "ʊ", "ə", "æ", "ɐ"])("places %s on the chart rather than beside it", (ipa) => {
    const found = VOWEL_POSITIONS.some((p) => p.unrounded?.ipa === ipa || p.rounded?.ipa === ipa);
    expect(found).toBe(true);
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
