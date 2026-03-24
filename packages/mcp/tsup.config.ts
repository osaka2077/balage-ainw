import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  // Shebang is already in source (index.ts line 1), no banner needed
  external: ["balage-core", "@modelcontextprotocol/sdk", "zod", "pino", "openai", "@anthropic-ai/sdk", "playwright", "node:crypto", "crypto"],
});
