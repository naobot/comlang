<script setup lang="ts">
import PhoneToggle from "@/components/ipa/PhoneToggle.vue";
import { EXTRA_VOWELS, VOWEL_BACKNESSES, VOWEL_ROWS } from "@/data/ipa";

defineProps<{ isSelected: (ipa: string) => boolean }>();
defineEmits<{ toggle: [ipa: string] }>();
</script>

<template>
  <section>
    <h2>Vowels</h2>
    <p class="hint">Unrounded left, rounded right. Rows are height, columns are backness.</p>

    <div class="scroller">
      <div class="quad">
        <!-- The trapezoid is drawn behind the grid rather than by it: laying the
             symbols out on a real quadrilateral would fight the grid at every
             breakpoint, and the outline is what makes it read as the IPA chart. -->
        <svg class="outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="0,0 100,0 100,100 50,100" />
        </svg>

        <div class="grid">
          <span class="axis"></span>
          <span v-for="b in VOWEL_BACKNESSES" :key="b" class="axis center">{{ b }}</span>

          <template v-for="row in VOWEL_ROWS" :key="row.height">
            <span class="axis">{{ row.height }}</span>
            <span v-for="slot in row.slots" :key="slot.backness" class="slot">
              <PhoneToggle
                v-if="slot.unrounded"
                :phone="slot.unrounded"
                :selected="isSelected(slot.unrounded.ipa)"
                @toggle="$emit('toggle', $event)"
              />
              <span v-else class="gap"></span>
              <PhoneToggle
                v-if="slot.rounded"
                :phone="slot.rounded"
                :selected="isSelected(slot.rounded.ipa)"
                @toggle="$emit('toggle', $event)"
              />
              <span v-else class="gap"></span>
            </span>
          </template>
        </div>
      </div>
    </div>

    <h3>Near and mid vowels</h3>
    <div class="row">
      <PhoneToggle
        v-for="p in EXTRA_VOWELS"
        :key="p.ipa"
        :phone="p"
        :selected="isSelected(p.ipa)"
        @toggle="$emit('toggle', $event)"
      />
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
  margin: 0 0 var(--sp-3);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.scroller {
  overflow-x: auto;
}

.quad {
  position: relative;
  min-width: 26rem;
  max-width: 34rem;
  padding: var(--sp-2);
}

.outline {
  position: absolute;
  /* Inset so the polygon tracks the symbol block, not the axis labels. */
  inset: 1.6rem 1rem 0.4rem 5.5rem;
  width: auto;
  height: auto;
}

.outline polygon {
  fill: none;
  stroke: var(--c-border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.grid {
  position: relative;
  display: grid;
  grid-template-columns: 5.5rem repeat(3, 1fr);
  align-items: center;
  gap: var(--sp-2) 0;
}

.axis {
  font-size: 0.75rem;
  color: var(--c-muted);
}

.axis.center {
  text-align: center;
}

.slot {
  display: flex;
  justify-content: center;
}

.gap {
  display: inline-block;
  min-width: 2rem;
}

h3 {
  margin: var(--sp-6) 0 var(--sp-1);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--c-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}
</style>
