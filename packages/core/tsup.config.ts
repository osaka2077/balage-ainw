import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["../../src/core/index.ts"],
  format: ["esm", "cjs"],
  dts: false, // DTS handgeschrieben in dist/index.d.ts (rootDir issue mit monorepo)
  splitting: false,
  sourcemap: true,
  clean: false, // NICHT dist/ loeschen — index.d.ts ist handgeschrieben
  outDir: "dist",
  external: ["playwright", "openai", "@anthropic-ai/sdk", "pino", "zod", "node:crypto", "crypto"],
  treeshake: true,
  minify: false,
});
