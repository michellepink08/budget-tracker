import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Every domain-function test in this project fakes a Prisma client with
    // a plain object of vi.fn() mocks, cast `as any` to satisfy each
    // function's real Prisma-typed parameter without hand-writing the full
    // type. That's a deliberate, consistent pattern across the whole test
    // suite, not sloppy typing — allow it here without loosening the rule
    // for real application code.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
