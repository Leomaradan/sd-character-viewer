import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
  isAuthenticatedRequest: vi.fn(),
}));

import * as auth from "@/lib/auth";
import { GET } from "./route";

describe("GET /api/auth/session", () => {
  it("returns misconfigured payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    isMisconfiguredMock.mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/auth/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns authenticated when auth is not required", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/auth/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: false,
      required: false,
      authenticated: true,
    });
  });

  it("returns auth status when protection is required", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/auth/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: false,
      required: true,
      authenticated: false,
    });
  });
});
