import { loadEnvConfig } from "@next/env";

let hasLoadedEnvFiles = false;

export function ensureLocalEnvLoaded(): void {
  if (hasLoadedEnvFiles) {
    return;
  }

  loadEnvConfig(process.cwd());
  hasLoadedEnvFiles = true;
}
