import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  resolveImageFilePath: vi.fn(),
}));

vi.mock("@/app/api/metadata/route", () => ({
  invalidateMetadataCacheEntry: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  ensureLocalEnvLoaded: vi.fn(),
  readBooleanEnvFlag: vi.fn(),
}));

import { promises as fs } from "node:fs";
import * as auth from "@/lib/auth";
import { resolveImageFilePath } from "@/lib/image-library";
import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import * as env from "@/lib/env";
import { DELETE, GET } from "./route";

describe("/api/image", () => {
  it("GET returns unauthorized when auth fails", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(401);
  });

  it("GET validates path and returns 400 when invalid", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/image?path=bad"));

    expect(response.status).toBe(400);
  });

  it("GET returns image bytes", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await GET(new Request("http://localhost/api/image?path=ok.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("GET returns 404 when file read fails", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/missing.png");
    readFileMock.mockRejectedValue(new Error("missing"));

    const response = await GET(new Request("http://localhost/api/image?path=missing.png"));

    expect(response.status).toBe(404);
  });

  it("DELETE returns misconfigured payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    isMisconfiguredMock.mockReturnValue(true);

    const response = await DELETE(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("DELETE returns unauthorized when auth fails", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(false);

    const response = await DELETE(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(401);
  });

  it("DELETE returns 403 when delete is disabled", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const ensureLocalEnvLoadedMock = vi.mocked(env.ensureLocalEnvLoaded);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(false);

    const response = await DELETE(new Request("http://localhost/api/image?path=a.png"));

    expect(ensureLocalEnvLoadedMock).toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("DELETE returns 400 when path is invalid", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue(null);

    const response = await DELETE(new Request("http://localhost/api/image?path=bad"));

    expect(response.status).toBe(400);
  });

  it("DELETE removes file and invalidates cache", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const unlinkMock = vi.mocked(fs.unlink);
    const invalidateMetadataCacheEntryMock = vi.mocked(invalidateMetadataCacheEntry);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    unlinkMock.mockResolvedValue(undefined);

    const response = await DELETE(new Request("http://localhost/api/image?path=ok.png"));

    expect(unlinkMock).toHaveBeenCalledWith("/tmp/a.png");
    expect(invalidateMetadataCacheEntryMock).toHaveBeenCalledWith("ok.png");
    expect(response.status).toBe(204);
  });

  it("DELETE returns 404 when delete fails", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const unlinkMock = vi.mocked(fs.unlink);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/missing.png");
    unlinkMock.mockRejectedValue(new Error("missing"));

    const response = await DELETE(new Request("http://localhost/api/image?path=missing.png"));

    expect(response.status).toBe(404);
  });
});
