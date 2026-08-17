import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn(),
    readdir: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  resolveImageFilePath: vi.fn(),
  resolvePreviewFilePath: vi.fn((filePath: string) => filePath.replace(/\.png$/i, ".preview.jpg")),
  removeFirstSeenCacheEntry: vi.fn(),
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
import { resolveImageFilePath, removeFirstSeenCacheEntry } from "@/lib/image-library";
import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import * as env from "@/lib/env";
import { DELETE, GET, PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("GET returns image bytes with cache-validation headers", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    statMock.mockResolvedValue({ size: 3, mtimeMs: 1_700_000_000_000 } as never);
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await GET(new Request("http://localhost/api/image?path=ok.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400, must-revalidate");
    expect(response.headers.get("ETag")).toBe('"3-18bcfe56800"');
    expect(response.headers.get("Last-Modified")).toBe(new Date(1_700_000_000_000).toUTCString());
  });

  it("GET uses private Cache-Control when password protection is enabled", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    statMock.mockResolvedValue({ size: 3, mtimeMs: 1_700_000_000_000 } as never);
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await GET(new Request("http://localhost/api/image?path=ok.png"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400, must-revalidate");
  });

  it("GET returns 304 when If-None-Match matches the current ETag", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    statMock.mockResolvedValue({ size: 3, mtimeMs: 1_700_000_000_000 } as never);

    const response = await GET(
      new Request("http://localhost/api/image?path=ok.png", {
        headers: { "If-None-Match": '"3-18bcfe56800"' },
      }),
    );

    expect(response.status).toBe(304);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("GET returns preview bytes when variant=preview and a preview exists", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    statMock.mockResolvedValue({ size: 3, mtimeMs: 1_700_000_000_000 } as never);
    readFileMock.mockResolvedValue(Buffer.from([4, 5, 6]));

    const response = await GET(
      new Request("http://localhost/api/image?path=ok.png&variant=preview"),
    );

    expect(statMock).toHaveBeenCalledWith("/tmp/a.preview.jpg");
    expect(readFileMock).toHaveBeenCalledWith("/tmp/a.preview.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("GET falls back to the full PNG when variant=preview but no preview exists", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const readFileMock = vi.mocked(fs.readFile);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    statMock.mockImplementation((requestedPath) => {
      if (requestedPath === "/tmp/a.preview.jpg") {
        return Promise.reject(new Error("missing"));
      }
      return Promise.resolve({ size: 3, mtimeMs: 1_700_000_000_000 } as never);
    });
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await GET(
      new Request("http://localhost/api/image?path=ok.png&variant=preview"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("GET returns 404 when file read fails", async () => {
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const statMock = vi.mocked(fs.stat);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    resolveImageFilePathMock.mockReturnValue("/tmp/missing.png");
    statMock.mockRejectedValue(new Error("missing"));

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
    const removeFirstSeenCacheEntryMock = vi.mocked(removeFirstSeenCacheEntry);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    unlinkMock.mockResolvedValue(undefined);
    removeFirstSeenCacheEntryMock.mockResolvedValue(undefined);

    const response = await DELETE(new Request("http://localhost/api/image?path=ok.png"));

    expect(unlinkMock).toHaveBeenCalledWith("/tmp/a.png");
    expect(unlinkMock).toHaveBeenCalledWith("/tmp/a.preview.jpg");
    expect(invalidateMetadataCacheEntryMock).toHaveBeenCalledWith("ok.png");
    expect(removeFirstSeenCacheEntryMock).toHaveBeenCalledWith("ok.png");
    expect(response.status).toBe(204);
  });

  it("DELETE succeeds even when no preview file exists", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const unlinkMock = vi.mocked(fs.unlink);
    const removeFirstSeenCacheEntryMock = vi.mocked(removeFirstSeenCacheEntry);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/a.png");
    removeFirstSeenCacheEntryMock.mockResolvedValue(undefined);
    unlinkMock.mockImplementation((requestedPath) => {
      if (requestedPath === "/tmp/a.preview.jpg") {
        return Promise.reject(new Error("missing"));
      }
      return Promise.resolve(undefined);
    });

    const response = await DELETE(new Request("http://localhost/api/image?path=ok.png"));

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

describe("/api/image PATCH", () => {
  it("PATCH returns misconfigured payload", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    isMisconfiguredMock.mockReturnValue(true);

    const response = await PATCH(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(200);
  });

  it("PATCH returns unauthorized when auth fails", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const isAuthenticatedRequestMock = vi.mocked(auth.isAuthenticatedRequest);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(true);
    isAuthenticatedRequestMock.mockReturnValue(false);

    const response = await PATCH(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(401);
  });

  it("PATCH returns 403 when rename is disabled", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(false);

    const response = await PATCH(new Request("http://localhost/api/image?path=a.png"));

    expect(response.status).toBe(403);
  });

  it("PATCH returns 400 when path is invalid", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue(null);

    const response = await PATCH(new Request("http://localhost/api/image?path=bad"));

    expect(response.status).toBe(400);
  });

  it("PATCH renames file with next available number", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const renameMock = vi.mocked(fs.rename);
    const readdirMock = vi.mocked(fs.readdir);

    const removeFirstSeenCacheEntryMock = vi.mocked(removeFirstSeenCacheEntry);
    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/ImageA.png");
    renameMock.mockResolvedValue(undefined);
    readdirMock.mockResolvedValue([]);
    removeFirstSeenCacheEntryMock.mockResolvedValue(undefined);

    const response = await PATCH(new Request("http://localhost/api/image?path=ImageA.png"));

    expect(response.status).toBe(200);
    expect(renameMock).toHaveBeenCalledWith("/tmp/ImageA.png", "/tmp/ImageA 2.png");
    expect(renameMock).toHaveBeenCalledWith("/tmp/ImageA.preview.jpg", "/tmp/ImageA 2.preview.jpg");
    const data = (await response.json()) as { newPath: string };
    expect(data.newPath).toBe("ImageA 2.png");
  });

  it("PATCH succeeds even when no preview file exists to rename", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const renameMock = vi.mocked(fs.rename);
    const readdirMock = vi.mocked(fs.readdir);
    const removeFirstSeenCacheEntryMock = vi.mocked(removeFirstSeenCacheEntry);

    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/ImageA.png");
    readdirMock.mockResolvedValue([]);
    removeFirstSeenCacheEntryMock.mockResolvedValue(undefined);
    renameMock.mockImplementation((from) => {
      if (from === "/tmp/ImageA.preview.jpg") {
        return Promise.reject(new Error("missing"));
      }
      return Promise.resolve(undefined);
    });

    const response = await PATCH(new Request("http://localhost/api/image?path=ImageA.png"));

    expect(response.status).toBe(200);
  });

  it("PATCH skips numbers already used by existing renamed files", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const renameMock = vi.mocked(fs.rename);
    const readdirMock = vi.mocked(fs.readdir);
    const removeFirstSeenCacheEntryMock = vi.mocked(removeFirstSeenCacheEntry);

    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/ImageA.png");
    renameMock.mockResolvedValue(undefined);
    readdirMock.mockResolvedValue(["ImageA 2.png", "ImageA 3.png", "Unrelated.png"] as never);
    removeFirstSeenCacheEntryMock.mockResolvedValue(undefined);

    const response = await PATCH(new Request("http://localhost/api/image?path=ImageA.png"));

    expect(response.status).toBe(200);
    expect(renameMock).toHaveBeenCalledWith("/tmp/ImageA.png", "/tmp/ImageA 4.png");
    const data = (await response.json()) as { newPath: string };
    expect(data.newPath).toBe("ImageA 4.png");
  });

  it("PATCH returns 500 when renaming fails", async () => {
    const isMisconfiguredMock = vi.mocked(auth.isMisconfigured);
    const isPasswordProtectionEnabledMock = vi.mocked(auth.isPasswordProtectionEnabled);
    const readBooleanEnvFlagMock = vi.mocked(env.readBooleanEnvFlag);
    const resolveImageFilePathMock = vi.mocked(resolveImageFilePath);
    const renameMock = vi.mocked(fs.rename);
    const readdirMock = vi.mocked(fs.readdir);

    isMisconfiguredMock.mockReturnValue(false);
    isPasswordProtectionEnabledMock.mockReturnValue(false);
    readBooleanEnvFlagMock.mockReturnValue(true);
    resolveImageFilePathMock.mockReturnValue("/tmp/ImageA.png");
    readdirMock.mockResolvedValue([]);
    renameMock.mockRejectedValue(new Error("disk error"));

    const response = await PATCH(new Request("http://localhost/api/image?path=ImageA.png"));

    expect(response.status).toBe(500);
  });
});
