import { loadEnvConfig } from "@next/env";

let hasLoadedEnvFiles = false;

export const readBooleanEnvFlag = (value: string | undefined): boolean => {
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
};

export const ensureLocalEnvLoaded = (): void => {
  if (hasLoadedEnvFiles) {
    return;
  }

  loadEnvConfig(process.cwd());
  hasLoadedEnvFiles = true;
};
