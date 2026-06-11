import { loadEnvConfig } from "@next/env";
import {
  SD_ALLOW_DELETE_ENV_KEY,
  SD_IMAGES_ROOT_ENV_KEY,
  SD_PASSWORD_ENV_KEY,
  SD_PASSWORD_SALT_ENV_KEY,
} from "@/lib/env-keys";

let hasLoadedEnvFiles = false;

const SD_ENV_KEYS = [
  SD_ALLOW_DELETE_ENV_KEY,
  SD_IMAGES_ROOT_ENV_KEY,
  SD_PASSWORD_ENV_KEY,
  SD_PASSWORD_SALT_ENV_KEY,
] as const;

const logDetectedEnvVars = (): void => {
  const detected = Object.fromEntries(
    SD_ENV_KEYS.map((key) => [key, process.env[key] === undefined ? "(not set)" : "(set)"]),
  );
  console.log("[env] SD_ environment variables:", detected);
};

export const readBooleanEnvFlag = (value: boolean | string | undefined): boolean => {
  const normalizedValue = value?.toString().trim().toLowerCase();
  return normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
};

export const ensureLocalEnvLoaded = (): void => {
  if (hasLoadedEnvFiles) {
    return;
  }

  loadEnvConfig(process.cwd());
  hasLoadedEnvFiles = true;
  logDetectedEnvVars();
};
