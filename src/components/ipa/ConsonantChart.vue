<script setup lang="ts">
import { computed } from "vue";

import PhoneToggle from "@/components/ipa/PhoneToggle.vue";
import { NON_PULMONIC, OTHER_SYMBOLS, PLACES, PULMONIC_ROWS } from "@/data/ipa";
import type { Phone } from "@/data/ipa";

/**
 * `isAvailable` narrows the chart to a subset — the project's own inventory, when this is
 * used as a picker rather than as the inventory page's reference grid. Omitted, every
 * phone is shown, which is what the inventory page needs.
 *
 * Rows *and* columns with nothing left are dropped rather than rendered empty: eleven
 * places of articulation holding three symbols is a grid you have to hunt through, and the
 * point of showing only the inventory is that you should not have to.
 */
const props = defineProps<{
  isSelected: (ipa: string) => boolean;
  isAvailable?: (ipa: string) => boolean;
}>();
defineEmits<{ toggle: [ipa: string] }>();

const shown = (phone: Phone | null | undefined): phone is Phone =>
  phone != null && (!props.isAvailable || props.isAvailable(phone.ipa));

const rows = computed(() =>
  PULMONIC_ROWS.map((row) => ({
    manner: row.manner,
    cells: row.cells.map((cell) => ({
      place: cell.place,
      impossible: cell.impossible,
      voiceless: shown(cell.voiceless) ? cell.voiceless : null,
      voiced: shown(cell.voiced) ? cell.voiced : null,
    })),
  })).filter((row) => !props.isAvailable || row.cells.some((c) => c.voiceless || c.voiced)),
);

/** The places any surviving row still uses, in the chart's own order. */
const places = computed(() => {
  if (!props.isAvailable) return [...PLACES] as string[];
  const used = new Set(
    rows.value.flatMap((row) =>
      row.cells.filter((c) => c.voiceless || c.voiced).map((c) => c.place as string),
    ),
  );
  return PLACES.filter((place) => used.has(place)) as string[];
});

type Row = (typeof rows.value)[number];

const cellsOf = (row: Row) => row.cells.filter((cell) => places.value.includes(cell.place));

const groups = (source: typeof NON_PULMONIC) =>
  source
    .map((group) => ({ label: group.label, phones: group.phones.filter(shown) }))
    .filter((group) => group.phones.length > 0);

const nonPulmonic = computed(() => groups(NON_PULMONIC));
const otherSymbols = computed(() => groups(OTHER_SYMBOLS));
</script>

<template>
  <section>
    <template v-if="rows.length">
      <h2>Pulmonic consonants</h2>
      <p class="hint">
        Voiceless left, voiced right. Shaded cells are articulations judged impossible.
      </p>
    </template>

    <!-- Eleven places of articulation do not fit a narrow window. The table scrolls
         inside this wrapper; the page body must never scroll sideways. -->
    <div v-if="rows.length" class="scroller">
      <table>
        <thead>
          <tr>
            <th scope="col" class="corner"></th>
            <th v-for="place in places" :key="place" scope="col">{{ place }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.manner">
            <th scope="row">{{ row.manner }}</th>
            <td
              v-for="cell in cellsOf(row)"
              :key="cell.place"
              :class="{ impossible: cell.impossible }"
            >
              <template v-if="!cell.impossible">
                <PhoneToggle
                  v-if="cell.voiceless"
                  :phone="cell.voiceless"
                  :selected="isSelected(cell.voiceless.ipa)"
                  @toggle="$emit('toggle', $event)"
                />
                <span v-else class="gap"></span>
                <PhoneToggle
                  v-if="cell.voiced"
                  :phone="cell.voiced"
                  :selected="isSelected(cell.voiced.ipa)"
                  @toggle="$emit('toggle', $event)"
                />
                <span v-else class="gap"></span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2 v-if="nonPulmonic.length">Non-pulmonic consonants</h2>
    <div v-if="nonPulmonic.length" class="groups">
      <div v-for="group in nonPulmonic" :key="group.label" class="group">
        <h3>{{ group.label }}</h3>
        <div class="row">
          <PhoneToggle
            v-for="p in group.phones"
            :key="p.ipa"
            :phone="p"
            :selected="isSelected(p.ipa)"
            @toggle="$emit('toggle', $event)"
          />
        </div>
      </div>
    </div>

    <h2 v-if="otherSymbols.length">Other symbols</h2>
    <div v-if="otherSymbols.length" class="groups">
      <div v-for="group in otherSymbols" :key="group.label" class="group">
        <h3>{{ group.label }}</h3>
        <div class="row">
          <PhoneToggle
            v-for="p in group.phones"
            :key="p.ipa"
            :phone="p"
            :selected="isSelected(p.ipa)"
            @toggle="$emit('toggle', $event)"
          />
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

h2:first-child {
  margin-top: 0;
}

.hint {
  margin: 0 0 var(--sp-3);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.scroller {
  overflow-x: auto;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

/* Eleven places of articulation want more room than the old 60rem page gave them, but a
   chart stretched across 2400px is all gap and no grid. */
table {
  border-collapse: collapse;
  width: 100%;
  max-width: 88rem;
}

th {
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--c-muted);
  text-align: left;
  padding: var(--sp-2);
  white-space: nowrap;
}

thead th {
  border-bottom: 1px solid var(--c-border);
  vertical-align: bottom;
}

tbody th {
  border-right: 1px solid var(--c-border);
  position: sticky;
  left: 0;
  background: var(--c-surface);
}

td {
  padding: 0 var(--sp-1);
  border-right: 1px solid var(--c-border);
  white-space: nowrap;
}

td:last-child {
  border-right: 0;
}

tbody tr + tr th,
tbody tr + tr td {
  border-top: 1px solid var(--c-border);
}

.impossible {
  background: repeating-linear-gradient(
    45deg,
    var(--c-raised),
    var(--c-raised) 4px,
    var(--c-surface) 4px,
    var(--c-surface) 8px
  );
}

/* Holds the column so a lone voiced symbol still sits on the right of its cell. */
.gap {
  display: inline-block;
  min-width: 2rem;
}

.groups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-6);
}

h3 {
  margin: 0 0 var(--sp-1);
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
