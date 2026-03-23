import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: "dist",
  banner: { js: "#!/usr/bin/env node" },
  external: ["@modelcontextprotocol/sdk", "zod", "pino", "openai", "@anthropic-ai/sdk", "playwright", "node:crypto", "crypto"],
});
