import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactRefresh from "eslint-plugin-react-refresh";
import reactPerf from "eslint-plugin-react-perf";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "react-perf": reactPerf,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactRefresh.configs.next.rules,
      "react-refresh/only-export-components": "warn",
      "react-perf/jsx-no-new-object-as-prop": "warn",
      "react-perf/jsx-no-new-function-as-prop": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test output
    "coverage/**",
  ]),
]);

export default eslintConfig;
