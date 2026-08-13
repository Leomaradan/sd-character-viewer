import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock("png-chunk-text", () => ({
  decode: vi.fn(),
}));

vi.mock("png-chunks-extract", () => ({
  default: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  resolveImageFilePath: vi.fn(),
}));

import { promises as fs } from "node:fs";
import { decode } from "png-chunk-text";
import extractChunks from "png-chunks-extract";
import * as auth from "@/lib/auth";
import { resolveImageFilePath } from "@/lib/image-library";
import { GET, invalidateMetadataCacheEntry } from "./route";

describe("/api/metadata GET", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(auth.isMisconfigured).mockReset();
    vi.mocked(auth.isPasswordProtectionEnabled).mockReset();
    vi.mocked(auth.isAuthenticatedRequest).mockReset();
    vi.mocked(resolveImageFilePath).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(extractChunks).mockReset();
    vi.mocked(decode).mockReset();
  });

  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/metadata?path=a.png"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns unauthorized when protected and not authenticated", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/metadata?path=a.png"));

    expect(response.status).toBe(401);
  });

  it("returns 400 when path is invalid", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/metadata?path=bad"));

    expect(response.status).toBe(400);
  });

  it("parses tEXt chunks, ignores others, and serves subsequent requests from cache", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/parse-cache.png");
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([1, 2, 3]));
    vi.mocked(extractChunks).mockReturnValue([
      { name: "IHDR", data: new Uint8Array() },
      { name: "tEXt", data: new Uint8Array([1]) },
    ] as never);
    vi.mocked(decode).mockReturnValue({ keyword: "prompt", text: "a cat" });

    const firstResponse = await GET(
      new Request("http://localhost/api/metadata?path=parse-cache.png"),
    );

    expect(firstResponse.status).toBe(200);
    await expect(firstResponse.json()).resolves.toEqual({ prompt: "a cat" });
    expect(fs.readFile).toHaveBeenCalledTimes(1);

    const secondResponse = await GET(
      new Request("http://localhost/api/metadata?path=parse-cache.png"),
    );

    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({ prompt: "a cat" });
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when reading the file fails", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/missing.png");
    vi.mocked(fs.readFile).mockRejectedValue(new Error("missing"));

    const response = await GET(new Request("http://localhost/api/metadata?path=missing.png"));

    expect(response.status).toBe(404);
  });

  it("refetches metadata after the cache entry has been invalidated", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/invalidate.png");
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([1, 2, 3]));
    vi.mocked(extractChunks).mockReturnValue([
      { name: "tEXt", data: new Uint8Array([1]) },
    ] as never);
    vi.mocked(decode).mockReturnValue({ keyword: "prompt", text: "first" });

    await GET(new Request("http://localhost/api/metadata?path=invalidate.png"));
    expect(fs.readFile).toHaveBeenCalledTimes(1);

    invalidateMetadataCacheEntry("invalidate.png");
    vi.mocked(decode).mockReturnValue({ keyword: "prompt", text: "second" });

    const response = await GET(new Request("http://localhost/api/metadata?path=invalidate.png"));

    expect(fs.readFile).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ prompt: "second" });
  });

  it("sweeps expired cache entries only once the sweep interval has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1));

    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from([1, 2, 3]));
    vi.mocked(extractChunks).mockReturnValue([
      { name: "tEXt", data: new Uint8Array([1]) },
    ] as never);
    vi.mocked(decode).mockReturnValue({ keyword: "prompt", text: "sweep-a" });
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/sweep-a.png");

    await GET(new Request("http://localhost/api/metadata?path=sweep-a.png"));

    // Not enough time passed for another sweep attempt; entry stays cached (not yet expired).
    vi.setSystemTime(new Date(2020, 0, 1, 0, 30));
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/sweep-b.png");
    vi.mocked(decode).mockReturnValue({ keyword: "prompt", text: "sweep-b" });
    await GET(new Request("http://localhost/api/metadata?path=sweep-b.png"));
    expect(fs.readFile).toHaveBeenCalledTimes(2);

    // Well beyond the sweep interval and TTL: both entries should be considered expired and purged.
    vi.setSystemTime(new Date(2020, 0, 10));
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/sweep-a.png");
    await GET(new Request("http://localhost/api/metadata?path=sweep-a.png"));
    expect(fs.readFile).toHaveBeenCalledTimes(3);
  });
});
