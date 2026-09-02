<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import AuthShell from "@/components/AuthShell.vue";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

/**
 * Choose a new password, reached two ways: from the link in a recovery email, or from the
 * account menu while already signed in. Both end in `updateUser`, so it is one form.
 *
 * The link half has to cope with three shapes of URL, because which one arrives depends on
 * the project's email template and the client's flow type, and none of that is decided
 * here:
 *
 *   * a `#access_token=…` fragment — the implicit flow. The Supabase client consumes it
 *     itself on load (`detectSessionInUrl`), so by the time `init()` resolves there is a
 *     session and there is nothing to do;
 *   * `?code=…` — PKCE, which has to be exchanged;
 *   * `?token_hash=…&type=recovery` — the newer templates, which have to be verified.
 *
 * Anything else means the link was already used, has expired, or somebody typed the URL.
 */
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

type State = "checking" | "ready" | "expired";
const state = ref<State>("checking");

const password = ref("");
const confirmation = ref("");
const done = ref(false);

const problem = computed(() =>
  confirmation.value ? passwordProblem(password.value, confirmation.value) : null,
);

const param = (key: string) => (typeof route.query[key] === "string" ? route.query[key] : null);

onMounted(async () => {
  // Resolves after the client has processed anything in the URL fragment, so a session
  // from the implicit flow is already in place here.
  await auth.init();

  if (!auth.user) {
    const code = param("code");
    const tokenHash = param("token_hash");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) auth.error = error.message;
    } else if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error) auth.error = error.message;
    }
  }

  state.value = auth.user ? "ready" : "expired";
});

async function onSubmit() {
  if (passwordProblem(password.value, confirmation.value)) return;
  if (await auth.setPassword(password.value)) done.value = true;
}
</script>

<template>
  <AuthShell
    title="Set a new password"
    :subtitle="state === 'ready' && !done ? `Signed in as ${auth.user?.email}.` : undefined"
  >
    <p v-if="state === 'checking'" class="muted">Checking the link…</p>

    <template v-else-if="state === 'expired'">
      <p class="muted">
        That link has expired or has already been used. Ask for another and it will work the same
        way.
      </p>
      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>
    </template>

    <p v-else-if="done" class="done" role="status">
      Password changed.
      <RouterLink :to="{ name: 'dashboard' }">Go to your projects</RouterLink>.
    </p>

    <form v-else @submit.prevent="onSubmit">
      <label>
        New password
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          required
        />
      </label>
      <label>
        New password again
        <input v-model="confirmation" type="password" autocomplete="new-password" required />
      </label>

      <p class="hint">At least {{ MIN_PASSWORD_LENGTH }} characters.</p>

      <p v-if="problem" class="error" role="alert">{{ problem }}</p>
      <p v-else-if="auth.error" class="error" role="alert">{{ auth.error }}</p>

      <button type="submit" :disabled="auth.working || !!problem">
        {{ auth.working ? "Saving…" : "Set password" }}
      </button>
    </form>

    <template #links>
      <RouterLink v-if="state === 'expired'" :to="{ name: 'reset-password' }">
        Send another link
      </RouterLink>
      <RouterLink v-if="!auth.user" :to="{ name: 'login' }">Back to sign in</RouterLink>
      <a v-else href="#" @click.prevent="router.push({ name: 'dashboard' })">Your projects</a>
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

.muted {
  margin-top: var(--sp-6);
  color: var(--c-muted);
}

.error {
  margin: 0;
  color: var(--c-danger);
}

.done {
  margin-top: var(--sp-6);
}
</style>
