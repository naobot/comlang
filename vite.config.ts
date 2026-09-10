import { fileURLToPath, URL } from "node:url";

import { defineConfig, lazyPlugins } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // Generated Supabase types and hand-written SQL are not ours to reformat, and the
  // Markdown is hand-wrapped for reading — reflowing it makes every prose edit a diff
  // against the formatter instead of against the text.
  //
  // `data/**` is one project's own material — hand-authored seed documents and frozen,
  // committed export snapshots. Reformatting a snapshot would make it stop matching the
  // bytes the harness was handed.
  fmt: {
    ignorePatterns: ["dist/**", "supabase/**", "data/**", "src/types/database.ts", "**/*.md"],
  },
  lint: {
    // oxlint's `vue` plugin covers the <script> block only — there is no template rule
    // in the set. Templates are checked by `vue-tsc`, which is why `check` runs both.
    plugins: ["vue", "typescript", "oxc"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // The dependency between the app and one project's tooling runs one way:
      // `scripts/xenic/**` may import from `src/lib`, never the reverse. Anything in
      // `src/` reaching into `scripts/` would put a single conlang's hard-coded facts
      // back into the code every project runs. See `scripts/xenic/README.md`.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["scripts/**", "**/scripts/**"],
              message:
                "src/ must not import from scripts/ — that code is hard-coded to one project.",
            },
          ],
        },
      ],
    },
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
