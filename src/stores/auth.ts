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
        ]).then(([members, phonemes, phonotactics, lexicon, grammarRules, wordClasses]) => {
          members.useMembersStore().reset();
          phonemes.usePhonemesStore().reset();
          phonotactics.usePhonotacticsStore().reset();
          lexicon.useLexiconStore().reset();
          grammarRules.useGrammarRulesStore().reset();
          wordClasses.useWordClassesStore().reset();
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

  async function signOut() {
    await supabase.auth.signOut();
    apply(null);
  }

  return { user, session, signingIn, error, ready, init, signIn, signOut };
});
