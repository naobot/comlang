import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "@/stores/auth";

/**
 * The header's tab bar, and the only place the tab list is written down. `AppHeader`
 * imports this rather than filtering `router.getRoutes()`, so adding a section means
 * adding a child route below and a line here — not teaching the header a new rule.
 *
 * `members` and `settings` are children too, but reached from the gear menu, so they
 * are deliberately absent.
 */
export const projectTabs = [
  { name: "project-phonemes", label: "Phonemes" },
  { name: "project-phonotactics", label: "Phonotactics" },
  { name: "project-word-classes", label: "Word Classes" },
  { name: "project-lexicon", label: "Lexicon" },
  { name: "project-corpus", label: "Corpus" },
  { name: "project-grammar", label: "Syntax" },
] as const;

// Orthography is hidden from the header for now. Its route stays live, so a saved link
// still resolves and re-showing it is one line here — orthography is where romanization
// goes once there is one, and upstream has none.

// Every tab renders the same placeholder until the linguistic core is designed. The
// route shape is the point: `/projects/:id/lexicon` is where a real lexicon will live.
const SectionPlaceholder = () => import("@/views/project/SectionPlaceholderView.vue");

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // The registration flow. Four pages, all of them reachable signed out and all of
    // them carrying their own centred layout — `meta.chrome: false` is what keeps the app
    // header off them (see App.vue).
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { chrome: false },
    },
    {
      path: "/signup",
      name: "signup",
      component: () => import("@/views/SignUpView.vue"),
      meta: { chrome: false },
    },
    {
      path: "/reset-password",
      name: "reset-password",
      component: () => import("@/views/ResetPasswordView.vue"),
      meta: { chrome: false },
    },
    {
      // Where a recovery link lands, and where the account menu sends someone changing
      // their password. Deliberately **not** bounced away from when signed in: a recovery
      // link creates a session, so arriving here signed in is the normal case.
      path: "/set-password",
      name: "set-password",
      component: () => import("@/views/SetPasswordView.vue"),
      meta: { chrome: false },
    },
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      // No `requiresAuth`: the dashboard lists published conlangs to anyone, and asks a
      // signed-out visitor to sign in for their own. See 0026.
    },
    {
      path: "/projects/:projectId",
      name: "project",
      component: () => import("@/views/ProjectWorkspaceView.vue"),
      // Also unguarded, for the same reason: a published project is readable signed out.
      // What a visitor may see is RLS's decision, not the router's — the workspace shows
      // "not found" for anything that comes back empty, which is what a private project
      // looks like from outside.
      props: true,
      // `props: true` does not cascade, so each child repeats it to get `projectId`.
      children: [
        { path: "", redirect: { name: "project-phonemes" } },
        {
          path: "phonemes",
          name: "project-phonemes",
          component: () => import("@/views/project/PhonemeInventoryView.vue"),
          props: true,
          meta: { tab: "Phoneme inventory" },
        },
        {
          path: "phonotactics",
          name: "project-phonotactics",
          component: () => import("@/views/project/PhonotacticsView.vue"),
          props: true,
          // The view renders the dependency notice itself; `requires` stays so the
          // meta reads the same across sections.
          meta: { tab: "Phonotactics", requires: "phonemes" },
        },
        {
          path: "word-classes",
          name: "project-word-classes",
          component: () => import("@/views/project/WordClassesView.vue"),
          props: true,
          meta: { tab: "Word classes", requires: "phonemes" },
        },
        {
          path: "lexicon",
          name: "project-lexicon",
          component: () => import("@/views/project/LexiconView.vue"),
          props: true,
          meta: { tab: "Lexicon", requires: "phonemes" },
        },
        {
          path: "corpus",
          name: "project-corpus",
          component: () => import("@/views/project/CorpusView.vue"),
          props: true,
          meta: { tab: "Corpus", requires: "phonemes" },
        },
        {
          path: "grammar",
          name: "project-grammar",
          component: () => import("@/views/project/GrammarRulesView.vue"),
          props: true,
          meta: { tab: "Grammar rules", requires: "phonemes" },
        },
        {
          path: "orthography",
          name: "project-orthography",
          component: SectionPlaceholder,
          props: true,
          meta: { tab: "Orthography" },
        },
        {
          path: "members",
          name: "project-members",
          component: () => import("@/views/project/ProjectMembersView.vue"),
          props: true,
        },
        {
          path: "settings",
          name: "project-settings",
          component: () => import("@/views/project/ProjectSettingsView.vue"),
          props: true,
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // Without this await, a cold load resolves the guard before getSession() returns and
  // throws an authenticated user back to /login.
  await auth.init();

  if (to.meta.requiresAuth && !auth.user) {
    return { name: "login", query: { r: to.fullPath } };
  }
  // Only the two pages that would be nonsense with a session already in hand. Reset and
  // set-password are not on this list on purpose — the first is how you fix an account
  // you are half-locked out of, and the second needs the session the link just created.
  if ((to.name === "login" || to.name === "signup") && auth.user) {
    return { name: "dashboard" };
  }
  return true;
});

export default router;
