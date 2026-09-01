<script setup lang="ts"></script>

<template>
  <main class="page">
    <h1>Not found</h1>
    <RouterLink :to="{ name: 'dashboard' }">Back to projects</RouterLink>
  </main>
</template>

<style scoped>
.page {
  max-width: 30rem;
  margin: 12vh auto;
  padding: var(--sp-6);
}
</style>
