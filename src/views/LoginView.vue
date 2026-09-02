<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AuthShell from "@/components/AuthShell.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");

/** Where to land afterwards. `r` is set by the router guard and by the read-only banner. */
const next = () => (typeof route.query.r === "string" ? route.query.r : "/");

async function onSubmit() {
  if (await auth.signIn(email.value, password.value)) await router.replace(next());
}
</script>

<template>
  <AuthShell title="Sign in">
    <form @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>

      <button type="submit" :disabled="auth.signingIn">
        {{ auth.signingIn ? "Signing in…" : "Sign in" }}
      </button>
    </form>

    <template #links>
      <RouterLink :to="{ name: 'signup', query: route.query }">Create an account</RouterLink>
      <RouterLink :to="{ name: 'reset-password' }">Forgot your password?</RouterLink>
    </template>
  </AuthShell>
</template>

<style scoped>
form {
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-6);
}

label {
  display: grid;
  gap: var(--sp-1);
}

.error {
  margin: 0;
  color: var(--c-danger);
}
</style>
