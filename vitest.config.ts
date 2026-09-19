import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    server: {
      deps: {
        inline: ["@mui/material", "@mui/icons-material"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "!src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      reporter: [["lcovonly"], ["html"], ["cobertura"], ["text-summary"]],
      thresholds: {
        autoUpdate: (newThreshold) => Math.floor(newThreshold),
        statements: 97,
        branches: 89,
        functions: 98,
        lines: 97,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
});
