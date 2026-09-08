<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";

import { type AnalyzeResult, type Recognizer, analyze, tokenizeConlang } from "@/lib/morphology";
import { useHoverIntent } from "@/composables/useHoverIntent";

import LexemePreview from "./LexemePreview.vue";

/**
 * A read-only rendering of conlang text where each recognised word is hoverable: hover,
 * focus or tap opens a `LexemePreview` with the word's morphological breakdown. Words the
 * engine cannot place render as plain text.
 *
 * Whitespace and newlines are preserved exactly (`white-space: pre-wrap`) so this can sit
 * in place of — later, on top of — the corpus textarea without the text reflowing.
 */
const props = defineProps<{
  text: string;
  recognizer: Recognizer | null;
  projectId: string;
}>();

const tokens = computed(() => tokenizeConlang(props.text));

/** One analysis per distinct word, reused across repeats of it in the same text. */
const analyses = computed(() => {
  const cache = new Map<string, AnalyzeResult>();
  if (!props.recognizer) return cache;
  for (const t of tokens.value) {
    if (t.kind === "word" && !cache.has(t.text)) {
      cache.set(t.text, analyze(t.text, props.recognizer));
    }
  }
  return cache;
});

const resultFor = (word: string): AnalyzeResult | null => analyses.value.get(word) ?? null;
const isKnown = (word: string): boolean => resultFor(word)?.ok === true;

const root = ref<HTMLElement | null>(null);
const anchor = ref<HTMLElement | null>(null);
const activeWord = ref<string | null>(null);
const { open, onEnter, onLeave, togglePin, close } = useHoverIntent();

const activeAnalyses = computed(() => {
  const r = activeWord.value ? resultFor(activeWord.value) : null;
  return r && r.ok ? r.analyses : [];
});

function show(event: Event, word: string) {
  const el = event.currentTarget;
  if (!(el instanceof HTMLElement) || !isKnown(word)) return;
  anchor.value = el;
  activeWord.value = word;
  onEnter();
}

// A pinned card is dismissed by a click that lands outside both the text and the card.
useEventListener(document, "pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (root.value?.contains(target)) return;
  if (target instanceof Element && target.closest(".card")) return;
  close();
});
</script>

<template>
  <div ref="root" class="corpus-text" @keydown.esc="close">
    <template v-for="(t, i) in tokens" :key="i">
      <span
        v-if="t.kind === 'word' && isKnown(t.text)"
        class="tok"
        tabindex="0"
        role="button"
        @mouseenter="show($event, t.text)"
        @focus="show($event, t.text)"
        @mouseleave="onLeave"
        @blur="onLeave"
        @click="togglePin"
        >{{ t.text }}</span
      >
      <template v-else>{{ t.text }}</template>
    </template>

    <LexemePreview
      v-if="open && activeAnalyses.length > 0"
      :analyses="activeAnalyses"
      :anchor="anchor"
      :project-id="projectId"
      @enter="onEnter"
      @leave="onLeave"
    />
  </div>
</template>

<style scoped>
.corpus-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
}

.tok {
  cursor: help;
  border-radius: 2px;
  text-decoration: underline dotted;
  text-decoration-color: var(--c-faint);
  text-underline-offset: 0.15em;
}

.tok:hover,
.tok:focus-visible {
  background: var(--c-raised);
  text-decoration-color: var(--c-accent);
  outline: none;
}
</style>
