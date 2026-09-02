<script setup lang="ts">
import { ref } from "vue";

import AuthShell from "@/components/AuthShell.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const email = ref("");
const sent = ref(false);

async function onSubmit() {
  if (await auth.sendPasswordReset(email.value)) sent.value = true;
}
</script>

<template>
  <AuthShell
    title="Reset your password"
    subtitle="We'll email you a link that signs you in long enough to choose a new one."
  >
    <!-- Says the same thing whether or not that address has an account. GoTrue answers
         the same way for both, and so does this: a form that distinguishes them is a way
         of asking the server which addresses are registered. -->
    <p v-if="sent" class="done" role="status">
      If <strong>{{ email }}</strong> has an account, a link is on its way. It expires after an
      hour, and asking again invalidates the previous one.
    </p>

    <form v-else @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>

      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>

      <button type="submit" :disabled="auth.working">
        {{ auth.working ? "Sending…" : "Send the link" }}
      </button>
    </form>

    <template #links>
      <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
      <RouterLink :to="{ name: 'signup' }">Create an account</RouterLink>
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

.done {
  margin-top: var(--sp-6);
  font-size: 0.9375rem;
}
</style>
