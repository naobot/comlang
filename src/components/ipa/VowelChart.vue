<script setup lang="ts">
import { computed } from "vue";

import PhoneToggle from "@/components/ipa/PhoneToggle.vue";
import { VOWEL_BACKNESSES, VOWEL_HEIGHTS, VOWEL_POSITIONS, vowelFrontEdge } from "@/data/ipa";
import type { Phone } from "@/data/ipa";

/**
 * `isAvailable` narrows the chart to a subset — the project's inventory, when this is a
 * picker rather than the inventory page's reference chart. Omitted, every vowel is shown.
 *
 * Unlike the consonant table nothing is dropped here beyond the symbols themselves: the
 * outline, the rules and the axis labels *are* the chart, and a vowel's meaning is where
 * it sits. Removing the frame to fit three vowels would leave three symbols floating.
 */
const props = defineProps<{
  isSelected: (ipa: string) => boolean;
  isAvailable?: (ipa: string) => boolean;
  /** Renders the chart as a reference rather than a picker. See `PhoneToggle`. */
  readOnly?: boolean;
}>();
defineEmits<{ toggle: [ipa: string] }>();

const shown = (phone: Phone | null | undefined): phone is Phone =>
  phone != null && (!props.isAvailable || props.isAvailable(phone.ipa));

const positions = computed(() =>
  VOWEL_POSITIONS.map((p) => ({
    ...p,
    unrounded: shown(p.unrounded) ? p.unrounded : null,
    rounded: shown(p.rounded) ? p.rounded : null,
  })),
);

const pct = (n: number) => `${n * 100}%`;

/**
 * The outline and the rules, in the plot's own 0–100 coordinates.
 *
 * Drawn from the same `vowelFrontEdge` the symbols are placed with, so the two cannot
 * drift apart — which is exactly what went wrong when the outline was a fixed polygon
 * behind a rectangular grid.
 */
const edgeAt = (y: number) => vowelFrontEdge(y) * 100;

const outline = `0,0 100,0 100,100 ${edgeAt(1)},100`;

/** Only the four ruled heights; the other three carry vowels but no line. */
const rules = VOWEL_HEIGHTS.filter((h) => h.major && h.y > 0 && h.y < 1).map((h) => ({
  y: h.y * 100,
  x: edgeAt(h.y),
}));

// The central column slants with the front edge, since it is halfway across each row.
const centralLine = { x1: 50, x2: edgeAt(1) + (100 - edgeAt(1)) / 2 };
</script>

<template>
  <section>
    <h2>Vowels</h2>
    <p class="hint">
      Position is the sound: height down, backness across, unrounded left of each point and rounded
      right. The front edge slants because there is less room to move front-to-back the further the
      jaw opens.
    </p>

    <div class="scroller">
      <div class="chart">
        <div class="plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon :points="outline" />
            <line v-for="r in rules" :key="r.y" :x1="r.x" :y1="r.y" x2="100" :y2="r.y" />
            <line :x1="centralLine.x1" y1="0" :x2="centralLine.x2" y2="100" />
          </svg>

          <span
            v-for="b in VOWEL_BACKNESSES"
            :key="b.label"
            class="backness"
            :style="{ left: pct(b.x) }"
          >
            {{ b.label }}
          </span>

          <!-- Right-aligned against the front edge rather than a fixed left column, so
               the labels follow the slant instead of drifting away from it. -->
          <span
            v-for="h in VOWEL_HEIGHTS"
            :key="h.label"
            class="height"
            :class="{ minor: !h.major }"
            :style="{ top: pct(h.y), right: `calc(100% - ${edgeAt(h.y)}%)` }"
          >
            {{ h.label }}
          </span>

          <span
            v-for="p in positions"
            :key="`${p.height}-${p.backness}`"
            class="pair"
            :style="{ left: pct(p.x), top: pct(p.y) }"
          >
            <span class="side">
              <PhoneToggle
                v-if="p.unrounded"
                :phone="p.unrounded"
                :read-only="readOnly"
                :selected="isSelected(p.unrounded.ipa)"
                @toggle="$emit('toggle', $event)"
              />
            </span>
            <span class="side">
              <PhoneToggle
                v-if="p.rounded"
                :phone="p.rounded"
                :read-only="readOnly"
                :selected="isSelected(p.rounded.ipa)"
                @toggle="$emit('toggle', $event)"
              />
            </span>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
h2 {
  margin: var(--sp-8) 0 var(--sp-1);
  font-size: 0.875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.hint {
  max-width: 40rem;
  margin: 0 0 var(--sp-4);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.scroller {
  overflow-x: auto;
}

/* Padding, not margin: the symbols straddle the outline, so the plot's own box is
   smaller than the space the chart needs. Left is widest for the height labels. */
.chart {
  min-width: 32rem;
  max-width: 38rem;
  padding: 2.75rem 2rem 1.5rem 8rem;
}

.plot {
  position: relative;
  aspect-ratio: 1.5 / 1;
}

svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

polygon {
  fill: none;
}

polygon,
line {
  stroke: var(--c-border);
  stroke-width: 1;
  /* preserveAspectRatio="none" scales x and y differently; without this the slanted
     edges would be drawn at a different weight from the horizontal ones. */
  vector-effect: non-scaling-stroke;
}

.backness {
  position: absolute;
  bottom: 100%;
  /* Width for the same reason `.height` needs one — "Back" sits at `left: 100%`, where
     an auto width has nothing to grow into. */
  width: 6rem;
  text-align: center;
  transform: translateX(-50%);
  /* Clear of the close row, whose symbol pairs straddle the top edge and are opaque. */
  padding-bottom: var(--sp-4);
  color: var(--c-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.height {
  position: absolute;
  /* Anchored by `right`, so it needs a width: with `width: auto` the box can only grow
     as far as its containing block's left edge, which at the close row is zero — the
     labels rendered as "Cl" and "Near-op". The width overhangs into the chart's left
     padding instead. */
  width: 8rem;
  text-align: right;
  transform: translateY(-50%);
  /* Clears the left half of a symbol pair sitting on the front edge, which is opaque and
     would otherwise paint over the end of the label. */
  padding-right: var(--sp-8);
  color: var(--c-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.height.minor {
  color: var(--c-faint);
}

/* Centred on its point and opaque, so the rules pass behind the symbols rather than
   through them — the same thing the printed chart does with white space. */
.pair {
  position: absolute;
  display: flex;
  align-items: center;
  transform: translate(-50%, -50%);
  background: var(--c-bg);
}

.side {
  display: flex;
  justify-content: center;
  min-width: 1.75rem;
}

@media (max-width: 40rem) {
  .chart {
    padding-left: 6.5rem;
  }

  .height {
    width: 6.5rem;
    font-size: 0.6875rem;
  }
}
</style>
