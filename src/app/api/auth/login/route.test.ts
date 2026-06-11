import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  AUTH_COOKIE_MAX_AGE_SECONDS: 60,
  AUTH_COOKIE_NAME: "sd_auth",
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
  validatePassword: vi.fn(),
  createAuthCookieValue: vi.fn(),
}));

import * as auth from "@/lib/auth";
import { POST } from "./route";

describe("POST /api/auth/login", () => {
  it("returns misconfigured payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    isMisconfiguredMock.mockReturnValue(true);

    const response = await POST(new Request("http://localhost/api/auth/login", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns authenticated when protection is disabled", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/auth/login", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, required: false });
  });

  it("returns 400 on invalid JSON payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);

    const request = {
      url: "http://localhost/api/auth/login",
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    } as unknown as Request;

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 401 on invalid password", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const validatePasswordMock = vi.mocked(auth.validatePassword);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    validatePasswordMock.mockReturnValue(false);

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "bad" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns success without cookie when no cookie value is available", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const validatePasswordMock = vi.mocked(auth.validatePassword);
    const createAuthCookieValueMock = vi.mocked(auth.createAuthCookieValue);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    validatePasswordMock.mockReturnValue(true);
    createAuthCookieValueMock.mockReturnValue(null);

    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "ok" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, required: false });
  });

  it("sets auth cookie on successful login", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const validatePasswordMock = vi.mocked(auth.validatePassword);
    const createAuthCookieValueMock = vi.mocked(auth.createAuthCookieValue);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    validatePasswordMock.mockReturnValue(true);
    createAuthCookieValueMock.mockReturnValue("token-123");

    const request = new Request("https://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "ok" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("sd_auth=token-123");
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    await expect(response.json()).resolves.toEqual({ authenticated: true, required: true });
  });
});
