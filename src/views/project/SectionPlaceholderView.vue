<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

// Every tab renders this until the linguistic core is designed. The title comes from
// the route's own meta so there is no second list of section names to keep in sync.
const title = computed(() => (typeof route.meta.tab === "string" ? route.meta.tab : "Section"));
</script>

<template>
  <section class="placeholder">
    <h1>{{ title }}</h1>
    <p class="muted">
      Not built yet. The linguistic core needs its own design pass — see
      <code>packages/own-conlang/grammar.yaml</code> in the harness repo, which is the model it
      should be derived from.
    </p>
  </section>
</template>

<style scoped>
.placeholder {
  padding: var(--sp-8) 0;
  text-align: center;
}

h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

.muted {
  max-width: 34rem;
  margin: 0 auto;
  color: var(--c-muted);
  font-size: 0.875rem;
}

code {
  font-family: var(--font-mono);
  font-size: 0.8125em;
}
</style>
