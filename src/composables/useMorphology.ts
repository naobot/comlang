import { type ComputedRef, computed } from "vue";

import { type Recognizer, getRecognizer } from "@/lib/morphology";
import { assembleSpec } from "@/lib/morphologySpec";
import { useLexiconStore } from "@/stores/lexicon";
import { useMorphologyStore } from "@/stores/morphology";

/**
 * The morphology recogniser for the current project, built from the lexicon and the
 * project's morphology plugin (`project_morphology`).
 *
 * Returns `null` only while the lexicon is empty — there is nothing to recognise against.
 * With a lexicon but **no plugin**, the recogniser still resolves exact lemma matches
 * (`assembleSpec` with a `null` document is citation-only). `getRecognizer` memoises on the
 * `spec.stems` array identity, so this recomputes only when the lexicon or the plugin
 * changes.
 */
export function useMorphology(): { recognizer: ComputedRef<Recognizer | null> } {
  const lexicon = useLexiconStore();
  const morphology = useMorphologyStore();

  const recognizer = computed<Recognizer | null>(() => {
    if (lexicon.entries.length === 0) return null;
    const { spec } = assembleSpec(lexicon.entries, morphology.specDoc);
    return getRecognizer(spec);
  });

  return { recognizer };
}
