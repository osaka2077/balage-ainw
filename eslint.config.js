import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "dist/",
      "node_modules/",
      "packages/*/dist/",
      "packages/*/node_modules/",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
      "tests/real-world/fixtures/",
    ],
  },
  {
    files: ["src/**/*.ts", "packages/*/src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
