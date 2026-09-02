<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import AppHeader from "@/components/AppHeader.vue";

const route = useRoute();

/**
 * The login screen keeps its own centred layout. Everything else gets the header —
 * **including a signed-out visitor**, who since 0026 has real pages to be on.
 *
 * This used to also require `auth.user`, from when every route was behind the auth guard.
 * With published projects that check hid the whole chrome from exactly the person who
 * needs it most: no project name, no tab bar, and so no way to reach any section but the
 * one the link landed on, which made a published conlang look like a single empty page.
 * The header handles the missing user itself — the account menu offers Sign in, and the
 * member-only items are gated on `members.canEdit`.
 */
const chrome = computed(() => route.name !== "login");
</script>

<template>
  <AppHeader v-if="chrome" />
  <RouterView />
</template>
