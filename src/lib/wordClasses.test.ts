import { describe, expect, it } from "vite-plus/test";
import { reactive } from "vue";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./wordClasses.ts?raw";

import {
  type Draft,
  canonicalDraft,
  categoriesOf,
  cloneDraft,
  emptyCategory,
  emptyClass,
  entryCounts,
  orphanedClassNames,
  problems,
} from "./wordClasses";

const draft = (): Draft => ({
  classes: [
    { name: "noun", kind: "open", description: "", categories: ["number", "case"] },
    { name: "verb", kind: "open", description: "", categories: ["tense"] },
    { name: "case marker", kind: "closed", description: "", categories: [] },
  ],
  categories: [
    {
      name: "number",
      description: "",
      values: [
        { value: "singular", notes: "" },
        { value: "plural", notes: "" },
        { value: "paucal", notes: "reduplication without numeral+counter" },
      ],
    },
    { name: "case", description: "", values: [{ value: "topic", notes: "" }] },
    { name: "tense", description: "", values: [{ value: "past", notes: "" }] },
  ],
});

describe("cloneDraft", () => {
  // The bug this exists to prevent killed every phonotactics save silently: a draft in a
  // ref is a reactive Proxy, and structuredClone throws DataCloneError on one.
  it("clones a reactive draft without throwing", () => {
    const live = reactive(draft());
    const copy = cloneDraft(live);
    copy.classes[0]!.name = "changed";
    expect(live.classes[0]!.name).toBe("noun");
  });
});

describe("canonicalDraft", () => {
  it("treats a reordered class list as a change, since order is stored", () => {
    const a = draft();
    const b = draft();
    b.classes.reverse();
    expect(canonicalDraft(a)).not.toBe(canonicalDraft(b));
  });

  // Ticking two boxes in the other order is the same statement about the language.
  it("treats a class's categories as a set", () => {
    const a = draft();
    const b = draft();
    b.classes[0]!.categories = ["case", "number"];
    expect(canonicalDraft(a)).toBe(canonicalDraft(b));
  });

  it("notices a changed value note", () => {
    const a = draft();
    const b = draft();
    b.categories[0]!.values[2]!.notes = "";
    expect(canonicalDraft(a)).not.toBe(canonicalDraft(b));
  });
});

describe("problems", () => {
  it("passes a well-formed draft", () => {
    expect(problems(draft())).toEqual([]);
  });

  it("names a duplicate class rather than quoting a constraint", () => {
    const d = draft();
    d.classes.push(emptyClass("noun"));
    expect(problems(d)).toContain("Two word classes are both called “noun”.");
  });

  it("catches an unnamed class and an unnamed category", () => {
    const d = draft();
    d.classes.push(emptyClass());
    d.categories.push(emptyCategory());
    expect(problems(d)).toContain("Every word class needs a name.");
    expect(problems(d)).toContain("Every category needs a name.");
  });

  it("catches a category listing the same value twice", () => {
    const d = draft();
    d.categories[0]!.values.push({ value: "plural", notes: "" });
    expect(problems(d)).toContain("“number” lists “plural” twice.");
  });

  // The RPC raises on this rather than dropping the link, but by then it is a missing
  // row and cannot say which class was at fault.
  it("names the class when a link points at a deleted category", () => {
    const d = draft();
    d.categories = d.categories.filter((c) => c.name !== "case");
    expect(problems(d)).toContain("“noun” inflects for “case”, which no longer exists.");
  });

  it("reports every problem at once, so fixing one does not reveal the next", () => {
    const d = draft();
    d.classes.push(emptyClass());
    d.categories.push(emptyCategory());
    expect(problems(d).length).toBeGreaterThan(1);
  });
});

describe("entryCounts", () => {
  it("counts entries per class and ignores unclassified ones", () => {
    const counts = entryCounts([
      { word_class: "noun" },
      { word_class: "noun" },
      { word_class: "verb" },
      { word_class: null },
      { word_class: "  " },
    ]);
    expect(counts.get("noun")).toBe(2);
    expect(counts.get("verb")).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("orphanedClassNames", () => {
  // word_class is text, not a foreign key, on purpose: an entry whose class was deleted
  // survives and is shown in red, rather than being deleted with it or blocking it.
  it("finds entries whose class no longer exists", () => {
    const orphans = orphanedClassNames(
      [
        { word_class: "noun" },
        { word_class: "predicate" },
        { word_class: "predicate" },
        { word_class: "adjective" },
      ],
      draft(),
    );
    expect(orphans).toEqual([
      { name: "predicate", count: 2 },
      { name: "adjective", count: 1 },
    ]);
  });

  it("finds none when every entry's class is defined", () => {
    expect(orphanedClassNames([{ word_class: "noun" }], draft())).toEqual([]);
  });
});

describe("categoriesOf", () => {
  it("resolves a class's category names to the categories themselves", () => {
    const d = draft();
    expect(categoriesOf(d.classes[0]!, d).map((c) => c.name)).toEqual(["number", "case"]);
  });

  it("skips a name that resolves to nothing rather than returning a hole", () => {
    const d = draft();
    d.categories = [];
    expect(categoriesOf(d.classes[0]!, d)).toEqual([]);
  });
});

describe("purity", () => {
  // Same guard as phonotactics.ts, and checked to actually fail when violated: this
  // module is imported by the exporter and could be imported by a future paradigm
  // builder, neither of which should drag in a store.
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
