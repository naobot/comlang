<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");

async function onSubmit() {
  if (await auth.signIn(email.value, password.value)) {
    const redirect = typeof route.query.r === "string" ? route.query.r : "/";
    await router.replace(redirect);
  }
}
</script>

<template>
  <main class="login">
    <h1>comlang</h1>
    <p class="tagline">Collaborative conlang management.</p>

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

    <!-- Accounts are created in the Supabase dashboard. There is deliberately no
         sign-up here: that is what keeps the app closed to the two of us without
         needing a public/private flag on projects. -->
    <p class="note">Accounts are created by the project owner.</p>
  </main>
</template>

<style scoped>
.login {
  max-width: 22rem;
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

form {
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-8);
}

label {
  display: grid;
  gap: var(--sp-1);
}

.error {
  margin: 0;
  color: var(--c-danger);
}

.note {
  margin-top: var(--sp-6);
  color: var(--c-muted);
  font-size: 0.875rem;
}
</style>
