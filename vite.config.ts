import { fileURLToPath, URL } from "node:url";

import { defineConfig, lazyPlugins } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // The generated Supabase types and the SQL migrations are not ours to format.
  fmt: {
    ignorePatterns: ["dist/**", "supabase/**", "src/types/database.ts"],
  },
  lint: {
    // oxlint's `vue` plugin covers the <script> block only — there is no template rule
    // in the set. Templates are checked by `vue-tsc`, which is why `check` runs both.
    plugins: ["vue", "typescript", "oxc"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    // tsgolint cannot resolve `.vue` modules, so its type check reports a phantom
    // TS2307 on every SFC import. `vue-tsc` type-checks this project properly —
    // including templates — so type checking lives there and `check` runs both.
    options: { typeAware: false, typeCheck: false },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  plugins: lazyPlugins(() => [vue(), vueDevTools()]),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
