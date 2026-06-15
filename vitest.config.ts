import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "!src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      reporter: [["lcovonly"], ["html"], ["cobertura"], ["text-summary"]],
      thresholds: {
        autoUpdate: (newThreshold) => Math.floor(newThreshold),
        statements: 86,
        branches: 76,
        functions: 92,
        lines: 86,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
