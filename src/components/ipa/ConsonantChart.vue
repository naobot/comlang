<script setup lang="ts">
import PhoneToggle from "@/components/ipa/PhoneToggle.vue";
import { NON_PULMONIC, OTHER_SYMBOLS, PLACES, PULMONIC_ROWS } from "@/data/ipa";

defineProps<{ isSelected: (ipa: string) => boolean }>();
defineEmits<{ toggle: [ipa: string] }>();
</script>

<template>
  <section>
    <h2>Pulmonic consonants</h2>
    <p class="hint">
      Voiceless left, voiced right. Shaded cells are articulations judged impossible.
    </p>

    <!-- Eleven places of articulation do not fit a narrow window. The table scrolls
         inside this wrapper; the page body must never scroll sideways. -->
    <div class="scroller">
      <table>
        <thead>
          <tr>
            <th scope="col" class="corner"></th>
            <th v-for="place in PLACES" :key="place" scope="col">{{ place }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in PULMONIC_ROWS" :key="row.manner">
            <th scope="row">{{ row.manner }}</th>
            <td
              v-for="cell in row.cells"
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

    <h2>Non-pulmonic consonants</h2>
    <div class="groups">
      <div v-for="group in NON_PULMONIC" :key="group.label" class="group">
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

    <h2>Other symbols</h2>
    <div class="groups">
      <div v-for="group in OTHER_SYMBOLS" :key="group.label" class="group">
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
