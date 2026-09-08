<script setup lang="ts">
import { useElementBounding } from "@vueuse/core";
import { computed } from "vue";

import type { Analysis, Morpheme } from "@/lib/morphology";
import { useLexiconStore } from "@/stores/lexicon";

/**
 * The card that opens when a corpus word is hovered or focused. It shows the reading(s)
 * the morphology engine found — a stem plus its affixes, each morpheme a chip that links
 * into the lexicon when it maps to an entry.
 *
 * Teleported to `<body>` so it escapes the corpus grid's `overflow: auto` and the table's
 * stacking context. Positioned by hand against the anchor with `useElementBounding`; there
 * is no flip library, so it just prefers below and clamps into the viewport.
 */
const props = defineProps<{
  analyses: readonly Analysis[];
  anchor: HTMLElement | null;
  projectId: string;
}>();

const emit = defineEmits<{ enter: []; leave: [] }>();

const lexicon = useLexiconStore();

const anchorRef = computed(() => props.anchor);
const { top, bottom, left, height } = useElementBounding(anchorRef);

/** Prefer below the word; flip above only when that would run off the bottom. */
const style = computed(() => {
  const MARGIN = 8;
  const CARD_W = 260;
  const viewportW = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 768 : window.innerHeight;
  const clampedLeft = Math.max(MARGIN, Math.min(left.value, viewportW - CARD_W - MARGIN));
  const below = bottom.value + 4;
  const roomBelow = viewportH - bottom.value;
  const placeAbove = roomBelow < 180 && top.value > 180;
  return {
    left: `${clampedLeft}px`,
    top: placeAbove ? "auto" : `${below}px`,
    bottom: placeAbove ? `${viewportH - top.value + 4}px` : "auto",
    "--anchor-h": `${height.value}px`,
  };
});

function entryIdFor(morpheme: Morpheme): string | null {
  if (!morpheme.entryKey) return null;
  const rows = lexicon.byEntryKey.get(morpheme.entryKey);
  return rows && rows.length > 0 ? (rows[0]?.id ?? null) : null;
}

const linkTo = (id: string) => ({
  name: "project-lexicon",
  params: { id: props.projectId },
  query: { entry: id },
});

const roleLabel = (m: Morpheme): string => (m.role === "stem" ? "" : m.gloss || m.role);
</script>

<template>
  <Teleport to="body">
    <div
      class="card"
      role="tooltip"
      :style="style"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <p v-if="analyses.length > 1" class="count">{{ analyses.length }} readings</p>

      <div
        v-for="(a, i) in analyses"
        :key="`${a.lemmaEntryKey ?? a.lemma}-${i}`"
        class="reading"
        :class="{ primary: i === 0 }"
      >
        <div class="head">
          <span class="lemma">{{ a.lemma }}</span>
          <span v-if="a.gloss" class="gloss">{{ a.gloss }}</span>
          <span v-if="a.wordClass" class="wc">{{ a.wordClass }}</span>
        </div>

        <div v-if="a.morphemes.length > 1 || a.reduplicated" class="morphemes">
          <template v-for="(m, j) in a.morphemes" :key="j">
            <span v-if="j > 0" class="plus" aria-hidden="true">+</span>
            <RouterLink
              v-if="entryIdFor(m)"
              :to="linkTo(entryIdFor(m) as string)"
              class="chip linked"
              :class="{ stem: m.role === 'stem' }"
            >
              <span class="form">{{ m.role === "stem" ? m.form : `-${m.form}` }}</span>
              <span v-if="roleLabel(m)" class="rl">{{ roleLabel(m) }}</span>
            </RouterLink>
            <span v-else class="chip" :class="{ stem: m.role === 'stem' }">
              <span class="form">{{ m.role === "stem" ? m.form : `-${m.form}` }}</span>
              <span v-if="roleLabel(m)" class="rl">{{ roleLabel(m) }}</span>
            </span>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.card {
  position: fixed;
  z-index: var(--z-popover);
  max-width: 260px;
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
  box-shadow: 0 12px 40px var(--c-shadow);
  font-family: var(--font-ui);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.count {
  margin: 0 0 var(--sp-2);
  color: var(--c-muted);
  font-size: 0.6875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.reading + .reading {
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--c-border);
}

.reading:not(.primary) {
  color: var(--c-muted);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-2);
}

.lemma {
  font-family: var(--font-mono);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.primary .lemma {
  color: var(--c-text);
}

.gloss {
  overflow-wrap: anywhere;
}

.wc {
  color: var(--c-faint);
  font-size: 0.6875rem;
}

.morphemes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-1);
  margin-top: var(--sp-2);
}

.plus {
  color: var(--c-faint);
}

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
  padding: 0.1em 0.4em;
  border: 1px solid var(--c-border);
  border-radius: calc(var(--radius) - 2px);
  background: var(--c-raised);
  color: inherit;
  text-decoration: none;
  font-size: 0.75rem;
}

.chip.stem {
  border-color: var(--c-accent);
}

.chip.linked:hover {
  background: var(--c-surface);
  border-color: var(--c-accent);
}

.chip .form {
  font-family: var(--font-mono);
}

.chip .rl {
  color: var(--c-muted);
  font-size: 0.6875rem;
}
</style>
