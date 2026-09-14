import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/*.spec.ts files use @playwright/test's own test runner, not
    // Vitest's — exclude them, and add back Vitest's own default
    // excludes (which an explicit `exclude` array replaces rather than
    // extends).
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
