import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  ensureLocalEnvLoaded: vi.fn(),
}));

import {
  AUTH_COOKIE_NAME,
  createAuthCookieValue,
  isAuthenticatedRequest,
  isMisconfigured,
  validatePassword,
} from "@/lib/auth";

/** Build a Request carrying an optional sd_auth cookie. */
const makeRequest = (cookieValue?: string): Request => {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set("cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`);
  }
  return new Request("http://localhost/", { headers });
};

describe("isMisconfigured", () => {
  afterEach(() => {
    delete process.env.SD_PASSWORD;
    delete process.env.SD_PASSWORD_SALT;
  });

  it("returns false when no password is configured", () => {
    expect(isMisconfigured()).toBe(false);
  });

  it("returns false when password and salt are both set", () => {
    process.env.SD_PASSWORD = "secret";
    process.env.SD_PASSWORD_SALT = "abc123";
    expect(isMisconfigured()).toBe(false);
  });

  it("returns true when password is set but salt is missing", () => {
    process.env.SD_PASSWORD = "secret";
    expect(isMisconfigured()).toBe(true);
  });

  it("returns false when only salt is set without password", () => {
    process.env.SD_PASSWORD_SALT = "abc123";
    expect(isMisconfigured()).toBe(false);
  });
});

describe("validatePassword", () => {
  afterEach(() => {
    delete process.env.SD_PASSWORD;
    delete process.env.SD_PASSWORD_SALT;
  });

  it("returns true for any input when password protection is disabled", () => {
    expect(validatePassword("anything")).toBe(true);
    expect(validatePassword("")).toBe(true);
  });

  it("accepts the correct password", () => {
    process.env.SD_PASSWORD = "hunter2";
    process.env.SD_PASSWORD_SALT = "validate-salt-correct";
    expect(validatePassword("hunter2")).toBe(true);
  });

  it("rejects a wrong password", () => {
    process.env.SD_PASSWORD = "hunter2";
    process.env.SD_PASSWORD_SALT = "validate-salt-wrong";
    expect(validatePassword("wrong")).toBe(false);
  });

  it("rejects an empty string when a password is configured", () => {
    process.env.SD_PASSWORD = "hunter2";
    process.env.SD_PASSWORD_SALT = "validate-salt-empty";
    expect(validatePassword("")).toBe(false);
  });
});

describe("isAuthenticatedRequest", () => {
  afterEach(() => {
    delete process.env.SD_PASSWORD;
    delete process.env.SD_PASSWORD_SALT;
  });

  it("authenticates any request when password protection is disabled", () => {
    expect(isAuthenticatedRequest(makeRequest())).toBe(true);
    expect(isAuthenticatedRequest(makeRequest("garbage"))).toBe(true);
  });

  it("accepts a request carrying the correct auth cookie", () => {
    process.env.SD_PASSWORD = "correct-pass";
    process.env.SD_PASSWORD_SALT = "auth-salt-valid";
    const validToken = createAuthCookieValue()!;
    expect(isAuthenticatedRequest(makeRequest(validToken))).toBe(true);
  });

  it("rejects a request with a wrong cookie value", () => {
    process.env.SD_PASSWORD = "correct-pass";
    process.env.SD_PASSWORD_SALT = "auth-salt-wrong";
    expect(isAuthenticatedRequest(makeRequest("deadbeef"))).toBe(false);
  });

  it("rejects a request with no auth cookie", () => {
    process.env.SD_PASSWORD = "correct-pass";
    process.env.SD_PASSWORD_SALT = "auth-salt-absent";
    expect(isAuthenticatedRequest(makeRequest())).toBe(false);
  });

  it("invalidates existing sessions when the salt is rotated", () => {
    process.env.SD_PASSWORD = "my-pass";
    process.env.SD_PASSWORD_SALT = "original-salt";
    const staleToken = createAuthCookieValue()!;

    process.env.SD_PASSWORD_SALT = "rotated-salt";

    expect(isAuthenticatedRequest(makeRequest(staleToken))).toBe(false);
  });
});
