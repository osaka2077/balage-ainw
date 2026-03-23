import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["../../src/core/index.ts"],
  format: ["esm"],
  dts: false, // DTS via separate tsc step (rootDir issue with monorepo)
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  external: ["playwright", "openai", "@anthropic-ai/sdk", "pino"],
  noExternal: ["zod"],
  treeshake: true,
  minify: false,
});
