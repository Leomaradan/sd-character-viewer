import { loadEnvConfig } from "@next/env";

let hasLoadedEnvFiles = false;

export const readBooleanEnvFlag = (value: boolean | string | undefined): boolean => {
  const normalizedValue = value?.toString().trim().toLowerCase();
  console.log({ value, normalizedValue });
  return normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
};

export const ensureLocalEnvLoaded = (): void => {
  if (hasLoadedEnvFiles) {
    return;
  }

  loadEnvConfig(process.cwd());
  hasLoadedEnvFiles = true;
};
