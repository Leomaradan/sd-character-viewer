import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
  isAuthenticatedRequest: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  readImageLibrary: vi.fn(),
}));

import * as auth from "@/lib/auth";
import { readImageLibrary } from "@/lib/image-library";
import { GET } from "./route";
import { ILibraryData } from "@/types/library";

describe("GET /api/library", () => {
  it("returns misconfigured payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    isMisconfiguredMock.mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/library"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns unauthorized when protection is enabled and request is not authenticated", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/library"));

    expect(response.status).toBe(401);
  });

  it("returns image library payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readImageLibraryMock = vi.mocked(readImageLibrary);
    const payload = { rootConfigured: true, images: [] } as unknown as ILibraryData;
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readImageLibraryMock.mockResolvedValue(payload);

    const response = await GET(new Request("http://localhost/api/library"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
  });
});
