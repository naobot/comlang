<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import AppHeader from "@/components/AppHeader.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();

// The login screen keeps its own centred layout, and there is nothing to put in the
// header before there is a user.
const chrome = computed(() => Boolean(auth.user) && route.name !== "login");
</script>

<template>
  <AppHeader v-if="chrome" />
  <RouterView />
</template>
