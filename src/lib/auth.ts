import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureLocalEnvLoaded } from "@/lib/env";

const PASSWORD_ENV_KEY = "SD_PASSWORD";
const SALT_ENV_KEY = "SD_PASSWORD_SALT";
export const AUTH_COOKIE_NAME = "sd_auth";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;

const buildSessionToken = (password: string): string => {
  const salt = getConfiguredSalt();
  return createHmac("sha256", salt).update(password).digest("hex");
};

const getConfiguredSalt = (): string => {
  ensureLocalEnvLoaded();
  return process.env[SALT_ENV_KEY]?.trim() ?? "";
};

const getConfiguredPassword = (): string | null => {
  ensureLocalEnvLoaded();
  const configuredPassword = process.env[PASSWORD_ENV_KEY]?.trim();
  return configuredPassword || null;
};

const parseCookies = (cookieHeader: string | null): Map<string, string> => {
  const cookieMap = new Map<string, string>();

  if (!cookieHeader) {
    return cookieMap;
  }

  const cookieParts = cookieHeader.split(";");

  for (const part of cookieParts) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    const name = rawName?.trim();

    if (!name || rawValueParts.length === 0) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();

    try {
      cookieMap.set(name, decodeURIComponent(rawValue));
    } catch {
      cookieMap.set(name, rawValue);
    }
  }

  return cookieMap;
};

const safeTokenMatches = (expectedToken: string, receivedToken: string): boolean => {
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const receivedBuffer = Buffer.from(receivedToken, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
};

export const isPasswordProtectionEnabled = (): boolean => {
  return getConfiguredPassword() !== null;
};

export const isMisconfigured = (): boolean => {
  return getConfiguredPassword() !== null && getConfiguredSalt() === "";
};

export const validatePassword = (password: string): boolean => {
  const configuredPassword = getConfiguredPassword();

  if (!configuredPassword) {
    return true;
  }

  const expectedToken = buildSessionToken(configuredPassword);
  const providedToken = buildSessionToken(password);

  return safeTokenMatches(expectedToken, providedToken);
};

export const isAuthenticatedRequest = (request: Request): boolean => {
  const configuredPassword = getConfiguredPassword();

  if (!configuredPassword) {
    return true;
  }

  const expectedToken = buildSessionToken(configuredPassword);
  const cookies = parseCookies(request.headers.get("cookie"));
  const authCookie = cookies.get(AUTH_COOKIE_NAME);

  if (!authCookie) {
    return false;
  }

  return safeTokenMatches(expectedToken, authCookie);
};

export const createAuthCookieValue = (): string | null => {
  const configuredPassword = getConfiguredPassword();

  if (!configuredPassword) {
    return null;
  }

  return buildSessionToken(configuredPassword);
};
