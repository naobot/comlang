import { defineStore } from "pinia";
import { ref } from "vue";
import type { Session, User } from "@supabase/supabase-js";

import { closeAllProjectChannels } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import { useProjectsStore } from "@/stores/projects";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const signingIn = ref(false);
  /** In flight for anything in the registration flow that is not the sign-in form. */
  const working = ref(false);
  const error = ref<string | null>(null);

  // getSession() is async, so a router guard that reads `user` synchronously on a cold
  // load sees null and bounces an authenticated user to /login. Everything that depends
  // on knowing whether we are logged in awaits this first.
  let readyResolve!: () => void;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  function apply(next: Session | null) {
    session.value = next;
    user.value = next?.user ?? null;
  }

  let initialised = false;

  async function init() {
    if (initialised) return ready;
    initialised = true;

    const { data } = await supabase.auth.getSession();
    apply(data.session);
    readyResolve();

    supabase.auth.onAuthStateChange((event, next) => {
      apply(next);
      if (event === "SIGNED_OUT") {
        // Channels opened under the old session are dead, and the cached rows belonged
        // to a user who is no longer here. Every project-scoped store must be cleared,
        // or signing in as someone else shows the previous user's data — including, for
        // phonemes, an unsaved draft that would then be saved into their project.
        closeAllProjectChannels();
        useProjectsStore().reset();
        // Imported here rather than at the top: stores/members.ts imports this module,
        // so a static import back would be a cycle.
        void Promise.all([
          import("@/stores/members"),
          import("@/stores/phonemes"),
          import("@/stores/phonotactics"),
          import("@/stores/lexicon"),
          import("@/stores/grammarRules"),
          import("@/stores/wordClasses"),
          import("@/stores/corpus"),
        ]).then(([members, phonemes, phonotactics, lexicon, grammarRules, wordClasses, corpus]) => {
          members.useMembersStore().reset();
          phonemes.usePhonemesStore().reset();
          phonotactics.usePhonotacticsStore().reset();
          lexicon.useLexiconStore().reset();
          grammarRules.useGrammarRulesStore().reset();
          wordClasses.useWordClassesStore().reset();
          corpus.useCorpusStore().reset();
        });
      }
    });

    return ready;
  }

  async function signIn(email: string, password: string) {
    signingIn.value = true;
    error.value = null;
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        error.value = signInError.message;
        return false;
      }
      apply(data.session);
      return true;
    } finally {
      signingIn.value = false;
    }
  }

  /**
   * Create an account.
   *
   * Returns whether a **session** came back with it, which is the difference between the
   * two ways a Supabase project can be configured: with `mailer_autoconfirm` on (this
   * project, checked) the account is live immediately and the caller can go straight to
   * the dashboard; with confirmations on, `session` is null and the caller has to say
   * "check your email" instead. Reading it off the response rather than hard-coding one
   * of the two means flipping that setting later changes nothing here.
   */
  async function signUp(email: string, password: string) {
    working.value = true;
    error.value = null;
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        error.value = signUpError.message;
        return null;
      }
      apply(data.session);
      return { session: data.session !== null };
    } finally {
      working.value = false;
    }
  }

  /**
   * Send a recovery email.
   *
   * `redirectTo` must be in the project's redirect allow-list (Dashboard → Authentication
   * → URL Configuration) or GoTrue quietly falls back to the Site URL and the link lands
   * on the dashboard instead of the form. That is configuration this repo cannot carry.
   *
   * Success here means "the request was accepted", **not** "an account exists". GoTrue
   * answers the same way either way, and so does this: telling an anonymous caller which
   * addresses have accounts is a disclosure the sign-in form does not otherwise make.
   */
  async function sendPasswordReset(email: string) {
    working.value = true;
    error.value = null;
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/set-password`,
      });
      if (resetError) {
        error.value = resetError.message;
        return false;
      }
      return true;
    } finally {
      working.value = false;
    }
  }

  /**
   * Set the password on the **current session**, whichever kind it is: the temporary one
   * a recovery link creates, or an ordinary one belonging to someone changing it from the
   * account menu. Both are `updateUser`, so there is one form and one path.
   */
  async function setPassword(password: string) {
    working.value = true;
    error.value = null;
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        error.value = updateError.message;
        return false;
      }
      user.value = data.user;
      return true;
    } finally {
      working.value = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    apply(null);
  }

  return {
    user,
    session,
    signingIn,
    working,
    error,
    ready,
    init,
    signIn,
    signUp,
    sendPasswordReset,
    setPassword,
    signOut,
  };
});
