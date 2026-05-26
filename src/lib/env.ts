import { loadEnvConfig } from "@next/env";

let hasLoadedEnvFiles = false;

export const ensureLocalEnvLoaded = (): void => {
  if (hasLoadedEnvFiles) {
    return;
  }

  loadEnvConfig(process.cwd());
  hasLoadedEnvFiles = true;
};
