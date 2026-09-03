<script setup lang="ts">
/**
 * The centred card the four auth pages share — sign in, sign up, reset, set password.
 *
 * They have no app header (there is no project to name and, on half of them, no user
 * yet), so the layout has to come from somewhere; putting it here rather than repeating
 * it four times is what keeps them looking like one flow instead of four screens that
 * happen to have forms on them.
 */
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <main class="auth">
    <h1>comlang</h1>
    <p class="tagline">Collaborative conlang management.</p>

    <h2>{{ title }}</h2>
    <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>

    <slot />

    <p class="links"><slot name="links" /></p>
  </main>
</template>

<style scoped>
.auth {
  max-width: 24rem;
  margin: 12vh auto;
  padding: var(--sp-6);
}

h1 {
  margin: 0;
}

.tagline {
  margin-top: var(--sp-1);
  color: var(--c-muted);
}

h2 {
  margin: var(--sp-8) 0 0;
  font-size: 0.875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.subtitle {
  margin: var(--sp-2) 0 0;
  font-size: 0.875rem;
}

/* Every page in the flow points at the other two, so nobody dead-ends on a screen that
   is not the one they wanted. */
.links {
  display: flex;
  gap: var(--sp-4);
  flex-wrap: wrap;
  margin-top: var(--sp-6);
  font-size: 0.875rem;
}

.links:empty {
  display: none;
}
</style>
