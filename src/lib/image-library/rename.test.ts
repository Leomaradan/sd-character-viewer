import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const mockedFsModule = await import("../../../__mocks__/fs.cjs");
  return mockedFsModule.default ?? mockedFsModule;
});

vi.mock("node:fs/promises", async () => {
  const mockedFsPromisesModule = await import("../../../__mocks__/fs/promises.cjs");
  return mockedFsPromisesModule.default ?? mockedFsPromisesModule;
});

import { vol } from "memfs";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  markImageAsSeen,
  migrateFirstSeenCacheEntry,
  migrateMarkedActionEntries,
  readToAnimateEntries,
  readToUpscaleEntries,
  readVideoLinks,
  setToAnimateEntry,
  setToUpscaleEntry,
} from "@/lib/image-library";

import { MediaRenameError, normalizeMediaStem, renameMediaFile } from "./rename";

const ROOT = "/tmp/sd-rename-root";
const CACHE_DIR = "/tmp/sd-rename-cache";
const ANNA_DIR = path.join(ROOT, "characters", "3d", "Anna");

const readFirstSeenCache = async (): Promise<Record<string, number>> => {
  const rootHash = Buffer.from(path.resolve(ROOT)).toString("base64url");
  return JSON.parse(
    await fs.readFile(path.join(CACHE_DIR, `${rootHash}.first-seen.json`), "utf8"),
  ) as Record<string, number>;
};

const expectRenameError = async (promise: Promise<unknown>, code: string) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(MediaRenameError);
  expect((error as MediaRenameError).code).toBe(code);
};

beforeEach(async () => {
  vol.reset();
  process.env.SD_IMAGES_ROOT = ROOT;
  process.env.SD_CACHE_DIR = CACHE_DIR;
  await fs.mkdir(ANNA_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(ANNA_DIR, "Casul.png"), "png");
  await fs.writeFile(path.join(ANNA_DIR, "Casul.preview.jpg"), "preview");
  await fs.writeFile(path.join(ANNA_DIR, "Base.png"), "base");
});

afterEach(() => {
  delete process.env.SD_IMAGES_ROOT;
  delete process.env.SD_CACHE_DIR;
});

describe("normalizeMediaStem", () => {
  it("trims a usable name", () => {
    expect(normalizeMediaStem("  Casual 2  ")).toBe("Casual 2");
    expect(normalizeMediaStem("Dancing (Casual) [Upscaled]")).toBe("Dancing (Casual) [Upscaled]");
  });

  it("rejects empty, hidden, path-like, or overlong names", () => {
    for (const stem of [
      "",
      "   ",
      ".hidden",
      "trailing.",
      "a/b",
      "a\\b",
      "a:b",
      "a?b",
      "x".repeat(201),
    ]) {
      expect(normalizeMediaStem(stem)).toBeNull();
    }
  });
});

describe("renameMediaFile", () => {
  it("renames the file and its preview, keeping the extension", async () => {
    const newPath = await renameMediaFile("characters/3d/Anna/Casul.png", " Casual ");

    expect(newPath).toBe("characters/3d/Anna/Casual.png");
    expect((await fs.readdir(ANNA_DIR)).sort()).toEqual([
      "Base.png",
      "Casual.png",
      "Casual.preview.jpg",
    ]);
  });

  it("drops a stale preview under the new name when the file had none", async () => {
    await fs.unlink(path.join(ANNA_DIR, "Casul.preview.jpg"));
    await fs.writeFile(path.join(ANNA_DIR, "Casual.preview.jpg"), "stale");

    await renameMediaFile("characters/3d/Anna/Casul.png", "Casual");

    expect((await fs.readdir(ANNA_DIR)).sort()).toEqual(["Base.png", "Casual.png"]);
  });

  it("returns the same path without touching disk when the name is unchanged", async () => {
    const renameSpy = vi.spyOn(fs, "rename");

    await expect(renameMediaFile("characters/3d/Anna/Casul.png", "Casul")).resolves.toBe(
      "characters/3d/Anna/Casul.png",
    );
    expect(renameSpy).not.toHaveBeenCalled();
    renameSpy.mockRestore();
  });

  it("allows a case-only rename of the same file", async () => {
    await expect(renameMediaFile("characters/3d/Anna/Casul.png", "CASUL")).resolves.toBe(
      "characters/3d/Anna/CASUL.png",
    );
  });

  it("rejects a name already used by another file, case-insensitively", async () => {
    await expectRenameError(renameMediaFile("characters/3d/Anna/Casul.png", "base"), "conflict");
    expect(await fs.readdir(ANNA_DIR)).toContain("Casul.png");
  });

  it("rejects invalid names, including preview-sidecar look-alikes", async () => {
    await expectRenameError(renameMediaFile("characters/3d/Anna/Casul.png", "a/b"), "invalid-name");
    await expectRenameError(
      renameMediaFile("characters/3d/Anna/Casul.png", "Base.preview"),
      "invalid-name",
    );
  });

  it("rejects invalid paths and missing files", async () => {
    await expectRenameError(renameMediaFile("../outside.png", "x"), "invalid-path");
    await expectRenameError(renameMediaFile("characters/3d/Anna/Gone.png", "x"), "not-found");
    await expectRenameError(renameMediaFile("characters/3d/Nobody/Gone.png", "x"), "not-found");
  });

  it("carries the first-seen entry, marks, and video links to the new path", async () => {
    const oldPath = "characters/3d/Anna/Casul.png";
    const newPath = "characters/3d/Anna/Casual.png";
    await markImageAsSeen(oldPath);
    await setToUpscaleEntry(ROOT, oldPath, "meta");
    await setToAnimateEntry(ROOT, oldPath, "meta", "zoom", "prompt");
    await fs.writeFile(
      path.join(ROOT, "video-links.json"),
      JSON.stringify({
        "characters/3d/Anna/Dance.mp4": {
          sourceRelativePath: oldPath,
          sourceMediaType: "image",
          action: "zoom",
          prompt: "prompt",
          metadata: "meta",
          linkedAt: 1,
        },
      }),
    );

    await renameMediaFile(oldPath, "Casual");

    const firstSeen = await readFirstSeenCache();
    expect(firstSeen).not.toHaveProperty(oldPath);
    expect(firstSeen[newPath]).toBe(0);
    expect(Object.keys(await readToUpscaleEntries(ROOT))).toEqual([newPath]);
    expect(Object.keys(await readToAnimateEntries(ROOT))).toEqual([newPath]);
    expect((await readVideoLinks(ROOT))["characters/3d/Anna/Dance.mp4"]?.sourceRelativePath).toBe(
      newPath,
    );
  });
});

describe("rename bookkeeping helpers", () => {
  it("are no-ops when no images root is configured", async () => {
    delete process.env.SD_IMAGES_ROOT;
    const writeFileSpy = vi.spyOn(fs, "writeFile");

    await migrateFirstSeenCacheEntry("a.png", "b.png");
    await migrateMarkedActionEntries("a.png", "b.png");

    expect(writeFileSpy).not.toHaveBeenCalled();
    writeFileSpy.mockRestore();
  });

  it("leaves the first-seen cache alone when the renamed file has no entry", async () => {
    await markImageAsSeen("characters/3d/Anna/Base.png");

    await renameMediaFile("characters/3d/Anna/Casul.png", "Casual");

    expect(await readFirstSeenCache()).toEqual({ "characters/3d/Anna/Base.png": 0 });
  });

  it("moves a renamed video's own link and ignores unrelated links", async () => {
    await fs.writeFile(path.join(ANNA_DIR, "Dance.mp4"), "mp4");
    const link = {
      sourceRelativePath: "characters/3d/Anna/Base.png",
      sourceMediaType: "image",
      action: "zoom",
      prompt: "prompt",
      metadata: "meta",
      linkedAt: 1,
    };
    await fs.writeFile(
      path.join(ROOT, "video-links.json"),
      JSON.stringify({ "characters/3d/Anna/Dance.mp4": link }),
    );

    await renameMediaFile("characters/3d/Anna/Dance.mp4", "Dancing");

    expect(await readVideoLinks(ROOT)).toEqual({ "characters/3d/Anna/Dancing.mp4": link });
  });

  it("still renames when the marks can't be rewritten", async () => {
    await setToUpscaleEntry(ROOT, "characters/3d/Anna/Casul.png", "meta");
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("read-only"));

    await expect(renameMediaFile("characters/3d/Anna/Casul.png", "Casual")).resolves.toBe(
      "characters/3d/Anna/Casual.png",
    );
    writeFileSpy.mockRestore();
  });
});
