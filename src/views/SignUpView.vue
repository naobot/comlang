<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AuthShell from "@/components/AuthShell.vue";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const password = ref("");
const confirmation = ref("");
/** Set when the project requires email confirmation and no session came back. */
const checkYourEmail = ref(false);

// Only after something has been typed in the second box: telling someone their passwords
// do not match before they have finished the first one is noise.
const problem = computed(() =>
  confirmation.value ? passwordProblem(password.value, confirmation.value) : null,
);

const next = () => (typeof route.query.r === "string" ? route.query.r : "/");

async function onSubmit() {
  if (passwordProblem(password.value, confirmation.value)) return;

  const result = await auth.signUp(email.value, password.value);
  if (!result) return;
  // A session means the account is live already (this project autoconfirms). Without one
  // there is a confirmation email in flight and nothing to do here but say so.
  if (result.session) await router.replace(next());
  else checkYourEmail.value = true;
}
</script>

<template>
  <AuthShell
    title="Create an account"
    subtitle="An account of your own, with your own conlangs. Someone can also add you to theirs once you have one."
  >
    <p v-if="checkYourEmail" class="done" role="status">
      Check your email for a confirmation link, then
      <RouterLink :to="{ name: 'login' }">sign in</RouterLink>.
    </p>

    <form v-else @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          required
        />
      </label>
      <label>
        Password again
        <input v-model="confirmation" type="password" autocomplete="new-password" required />
      </label>

      <p class="hint">At least {{ MIN_PASSWORD_LENGTH }} characters. Length beats punctuation.</p>

      <p v-if="problem" class="error" role="alert">{{ problem }}</p>
      <p v-else-if="auth.error" class="error" role="alert">{{ auth.error }}</p>

      <button type="submit" :disabled="auth.working || !!problem">
        {{ auth.working ? "Creating…" : "Create account" }}
      </button>
    </form>

    <template #links>
      <RouterLink :to="{ name: 'login', query: route.query }">Already have an account?</RouterLink>
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

.hint {
  margin: 0;
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.error {
  margin: 0;
  color: var(--c-danger);
}

.done {
  margin-top: var(--sp-6);
}
</style>
