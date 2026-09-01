import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
    },
    {
      path: "/",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/projects/:projectId",
      name: "project",
      component: () => import("@/views/ProjectWorkspaceView.vue"),
      meta: { requiresAuth: true },
      props: true,
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
  if (to.name === "login" && auth.user) {
    return { name: "dashboard" };
  }
  return true;
});

export default router;
