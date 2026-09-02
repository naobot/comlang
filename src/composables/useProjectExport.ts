import { computed } from "vue";

import {
  type ExportInput,
  slugify,
  toCorpusCsv,
  toGrammarYaml,
  toLexiconCsv,
  toLexiconCsvFull,
} from "@/lib/exporters";
import { useCorpusStore } from "@/stores/corpus";
import { useGrammarRulesStore } from "@/stores/grammarRules";
import { useLexiconStore } from "@/stores/lexicon";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import { useProjectsStore } from "@/stores/projects";
import { useWordClassesStore } from "@/stores/wordClasses";

/**
 * Gathers every section into one `ExportInput` and hands back download actions.
 *
 * Split from `lib/exporters.ts` on purpose: the formatting is pure and unit-tested, and
 * everything that touches a store or the DOM lives here. That is also why the header stays
 * thin despite export needing data from every section's store.
 */
export function useProjectExport(projectId: () => string | null) {
  const projects = useProjectsStore();
  const phonemes = usePhonemesStore();
  const phonotactics = usePhonotacticsStore();
  const lexicon = useLexiconStore();
  const grammarRules = useGrammarRulesStore();
  const wordClasses = useWordClassesStore();
  const corpus = useCorpusStore();

  /**
   * Built from what is **saved**, not from any in-progress draft. An export is a record
   * of the language, and shipping half-typed edits into a file someone archives would be
   * worse than making them press Save first.
   */
  const input = computed<ExportInput>(() => {
    const id = projectId();
    const project = id ? projects.get(id) : null;
    return {
      projectName: project?.name ?? "conlang",
      generatedAt: new Date(),
      phonemes: phonemes.inventory.map((p) => ({ ipa: p.ipa, kind: p.kind })),
      classes: phonotactics.persisted.classes.map((c) => ({
        symbol: c.symbol,
        label: c.label,
        phoneme_ipa: c.phoneme_ipa,
      })),
      templates: phonotactics.persisted.templates.map((t) => ({
        name: t.name,
        weight: t.weight,
        slots: t.slots.map((s) => ({
          role: s.role,
          optional: s.optional,
          class_symbol: s.class_symbol,
        })),
      })),
      constraints: phonotactics.persisted.constraints.map((c) => ({
        kind: c.kind,
        role: c.role,
        seq_position: c.seq_position,
        a_class_symbol: c.a_class_symbol,
        a_phoneme_ipa: c.a_phoneme_ipa,
        b_class_symbol: c.b_class_symbol,
        b_phoneme_ipa: c.b_phoneme_ipa,
      })),
      lexicon: lexicon.entries.map((e) => ({
        entry_key: e.entry_key,
        lemma: e.lemma,
        gloss: e.gloss,
        word_class: e.word_class,
        notes: e.notes,
      })),
      rules: grammarRules.persisted.map((r) => ({ ...r })),
      wordClasses: wordClasses.persisted.classes.map((c) => ({
        name: c.name,
        kind: c.kind,
        description: c.description,
        categories: [...c.categories],
      })),
      categories: wordClasses.persisted.categories.map((c) => ({
        name: c.name,
        description: c.description,
        values: c.values.map((v) => ({ value: v.value, notes: v.notes })),
      })),
      corpus: corpus.entries.map((e) => ({ english: e.english, conlang: e.conlang })),
    };
  });

  /** Nothing saved yet means nothing worth writing to a file. */
  const hasAnything = computed(
    () =>
      input.value.phonemes.length > 0 ||
      input.value.lexicon.length > 0 ||
      input.value.rules.length > 0 ||
      input.value.wordClasses.length > 0 ||
      input.value.corpus.length > 0,
  );

  function download(filename: string, contents: string, mime: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked on the next tick rather than immediately: Safari has not necessarily
    // started reading the blob by the time click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stem = () => slugify(input.value.projectName);

  return {
    hasAnything,
    exportGrammarYaml: () =>
      download(`${stem()}-grammar.yaml`, toGrammarYaml(input.value), "text/yaml"),
    exportLexiconCsv: () =>
      download(`${stem()}-lexicon.csv`, toLexiconCsv(input.value), "text/csv"),
    exportLexiconCsvFull: () =>
      download(`${stem()}-lexicon-full.csv`, toLexiconCsvFull(input.value), "text/csv"),
    exportCorpusCsv: () => download(`${stem()}-corpus.csv`, toCorpusCsv(input.value), "text/csv"),
  };
}
