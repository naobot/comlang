<script setup lang="ts">
import { computed, ref } from "vue";

import PhoneToggle from "@/components/ipa/PhoneToggle.vue";
import { FEATURES_BY_IPA, MANNERS, PHONE_BY_IPA } from "@/data/ipa";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

const newSymbol = ref("");
const open = ref<string | null>(null);

// The saved inventory, not the draft: a class can only contain a phoneme that actually
// exists as a row, because membership is a foreign key.
const available = computed(() => phonemes.inventory);

function add() {
  if (phonotactics.addClass(newSymbol.value)) {
    open.value = newSymbol.value.trim();
    newSymbol.value = "";
  }
}

/** Quick-fill: intersect a chart feature with what this project actually has. */
function fill(symbol: string, predicate: (ipa: string) => boolean) {
  phonotactics.setMembers(symbol, available.value.map((p) => p.ipa).filter(predicate));
}

const isVowel = (ipa: string) => PHONE_BY_IPA.get(ipa)?.kind === "vowel";
const byManner = (manner: string) => (ipa: string) => FEATURES_BY_IPA.get(ipa)?.manner === manner;

// Only offer a manner that this project has segments for; a button that fills nothing
// is just a dead control.
const availableManners = computed(() =>
  MANNERS.filter((m) => available.value.some((p) => FEATURES_BY_IPA.get(p.ipa)?.manner === m)),
);
</script>

<template>
  <section>
    <h2>Phoneme classes</h2>
    <p class="hint">
      Named sets a template can refer to. A segment may belong to several — ŋ is both a nasal and a
      velar.
    </p>

    <ul class="classes">
      <li v-for="cls in phonotactics.draft.classes" :key="cls.symbol">
        <div class="head">
          <button
            type="button"
            class="symbol"
            @click="open = open === cls.symbol ? null : cls.symbol"
          >
            {{ cls.symbol }}
          </button>
          <input
            v-model="cls.label"
            class="label"
            placeholder="description (optional)"
            :aria-label="`Label for class ${cls.symbol}`"
          />
          <span class="count" :class="{ empty: cls.phoneme_ipa.length === 0 }">
            {{ cls.phoneme_ipa.length }} member{{ cls.phoneme_ipa.length === 1 ? "" : "s" }}
          </span>
          <button type="button" @click="phonotactics.removeClass(cls.symbol)">Remove</button>
        </div>

        <p v-if="cls.phoneme_ipa.length" class="members">
          <span v-for="ipa in cls.phoneme_ipa" :key="ipa">{{ ipa }}</span>
        </p>
        <p v-else class="warn">Empty. A required slot using this class can never be filled.</p>

        <div v-if="open === cls.symbol" class="picker">
          <div class="quick">
            <button type="button" @click="fill(cls.symbol, (i) => !isVowel(i))">
              All consonants
            </button>
            <button type="button" @click="fill(cls.symbol, isVowel)">All vowels</button>
            <button
              v-for="manner in availableManners"
              :key="manner"
              type="button"
              @click="fill(cls.symbol, byManner(manner))"
            >
              {{ manner }}s
            </button>
            <button type="button" @click="phonotactics.setMembers(cls.symbol, [])">Clear</button>
          </div>

          <div class="grid">
            <PhoneToggle
              v-for="p in available"
              :key="p.ipa"
              :phone="PHONE_BY_IPA.get(p.ipa) ?? { ipa: p.ipa, kind: p.kind, name: p.ipa }"
              :selected="cls.phoneme_ipa.includes(p.ipa)"
              @toggle="phonotactics.toggleMember(cls.symbol, $event)"
            />
          </div>
        </div>
      </li>
    </ul>

    <form class="add" @submit.prevent="add">
      <input v-model="newSymbol" placeholder="New class symbol, e.g. C" aria-label="Class symbol" />
      <button type="submit" :disabled="!newSymbol.trim()">Add class</button>
    </form>
  </section>
</template>

<style scoped>
h2 {
  margin: 0 0 var(--sp-1);
  font-size: 0.875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.hint {
  margin: 0 0 var(--sp-4);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.classes {
  list-style: none;
  margin: 0 0 var(--sp-4);
  padding: 0;
  display: grid;
  gap: var(--sp-3);
}

.classes li {
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.symbol {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  text-transform: none;
  letter-spacing: normal;
  min-width: 2.5rem;
  background: var(--c-raised);
}

.label {
  flex: 1;
  min-width: 0;
}

.count {
  color: var(--c-muted);
  font-size: 0.8125rem;
  white-space: nowrap;
}

.count.empty {
  color: var(--c-danger);
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin: var(--sp-2) 0 0;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--c-muted);
}

.warn {
  margin: var(--sp-2) 0 0;
  color: var(--c-danger);
  font-size: 0.8125rem;
}

.picker {
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--c-border);
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-bottom: var(--sp-2);
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.add {
  display: flex;
  gap: var(--sp-2);
  max-width: 24rem;
}
</style>
