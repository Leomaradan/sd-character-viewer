import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({ promises: { stat: vi.fn() } }));

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  getImagesRootPathFromEnv: vi.fn(),
  resolveImageFilePath: vi.fn(),
  setRatingEntry: vi.fn(),
}));

import { promises as fs, type Stats } from "node:fs";

import * as auth from "@/lib/auth";
import {
  getImagesRootPathFromEnv,
  resolveImageFilePath,
  setRatingEntry,
} from "@/lib/image-library";

import { PUT } from "./route";

const put = (path: string, body: unknown) =>
  PUT(
    new Request(`http://localhost/api/rating?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const fileStat = { isFile: () => true } as Stats;

describe("/api/rating PUT", () => {
  beforeEach(() => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/root/characters/3d/Anna/Casual.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/root");
    vi.mocked(fs.stat).mockResolvedValue(fileStat);
    process.env.SD_ALLOW_DELETE = "true";
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.SD_ALLOW_DELETE;
  });

  it("returns the misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await put("characters/3d/Anna/Casual.png", { rating: "good" });

    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
    expect(setRatingEntry).not.toHaveBeenCalled();
  });

  it("returns unauthorized when protected and not authenticated", async () => {
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    expect((await put("characters/3d/Anna/Casual.png", { rating: "good" })).status).toBe(401);
  });

  it("is forbidden without SD_ALLOW_DELETE", async () => {
    delete process.env.SD_ALLOW_DELETE;

    expect((await put("characters/3d/Anna/Casual.png", { rating: "good" })).status).toBe(403);
    expect(setRatingEntry).not.toHaveBeenCalled();
  });

  it("rejects an invalid path", async () => {
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    expect((await put("../secret.png", { rating: "good" })).status).toBe(400);
    expect((await put("", { rating: "good" })).status).toBe(400);
  });

  it.each([{ rating: "bad" }, {}, "not json", null])("rejects an invalid body %j", async (body) => {
    expect((await put("characters/3d/Anna/Casual.png", body)).status).toBe(400);
    expect(setRatingEntry).not.toHaveBeenCalled();
  });

  it("fails when the library root isn't configured", async () => {
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue(null);

    expect((await put("characters/3d/Anna/Casual.png", { rating: "good" })).status).toBe(400);
  });

  it("returns 404 when rating a file that doesn't exist", async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    expect((await put("characters/3d/Anna/Casual.png", { rating: "ok" })).status).toBe(404);
    expect(setRatingEntry).not.toHaveBeenCalled();
  });

  it("saves the rating", async () => {
    const response = await put("characters\\3d\\Anna\\Casual.png ", { rating: "good" });

    expect(response.status).toBe(204);
    expect(setRatingEntry).toHaveBeenCalledWith("/root", "characters/3d/Anna/Casual.png", "good");
  });

  it("clears a rating even when the file is gone", async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    const response = await put("characters/3d/Anna/Casual.png", { rating: null });

    expect(response.status).toBe(204);
    expect(setRatingEntry).toHaveBeenCalledWith("/root", "characters/3d/Anna/Casual.png", null);
  });
});
