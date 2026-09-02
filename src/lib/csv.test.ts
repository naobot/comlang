import { describe, expect, it } from "vite-plus/test";

import { csvField, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('k,"exist, there is"\n')).toEqual([["k", "exist, there is"]]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('k,"a ""quoted"" word"\n')).toEqual([["k", 'a "quoted" word']]);
  });

  // A notes field really does contain these.
  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('k,"line one\nline two"\n')).toEqual([["k", "line one\nline two"]]);
  });

  it("treats CRLF as one break, not an empty row", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("reads a last row with no trailing newline", () => {
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });

  // Excel writes one, and it would otherwise become part of the first header cell.
  it("strips a byte-order mark", () => {
    expect(parseCsv("﻿key,lemma\n")).toEqual([["key", "lemma"]]);
  });

  it("drops blank lines rather than emitting empty rows", () => {
    expect(parseCsv("a,b\n\nc,d\n")).toHaveLength(2);
  });
});

describe("csvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvField("mi kan yu")).toBe("mi kan yu");
  });

  // Quoted, or the separator would split one sentence into two columns.
  it("quotes a value containing a comma, a quote or a newline", () => {
    expect(csvField("Yes, I see you")).toBe('"Yes, I see you"');
    expect(csvField('She said "no"')).toBe('"She said ""no"""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
  });

  it("round-trips whatever it quotes", () => {
    for (const value of ["plain", "a,b", 'a "b" c', "a\nb"]) {
      expect(parseCsv(`${csvField(value)},x\n`)).toEqual([[value, "x"]]);
    }
  });
});
