import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const mockedFsModule = await import("../../__mocks__/fs.cjs");
  return mockedFsModule.default ?? mockedFsModule;
});

vi.mock("node:fs/promises", async () => {
  const mockedFsPromisesModule = await import("../../__mocks__/fs/promises.cjs");
  return mockedFsPromisesModule.default ?? mockedFsPromisesModule;
});

import { vol } from "memfs";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { IImageItem, ILibraryData } from "@/types/library";

import {
  findDuplicateGroups,
  getExtraImagesRootPathsFromEnv,
  isDuplicateGroupReviewed,
  isVideoFilePath,
  parsePoseName,
  readImageLibrary,
  readReviewedDuplicateGroups,
  readToAnimateEntries,
  readToUpscaleEntries,
  removeLibraryIndexCache,
  removeMarkedActionEntries,
  removeToAnimateEntry,
  removeToUpscaleEntry,
  resolveImageFilePath,
  resolvePreviewFilePath,
  setToAnimateEntry,
  setToUpscaleEntry,
  writeReviewedDuplicateGroups,
} from "@/lib/image-library";

beforeEach(() => {
  vol.reset();
  vi.useRealTimers();
  delete process.env.SD_IMAGES_ROOT;
  delete process.env.SD_EXTRA_IMAGES_ROOT;
  delete process.env.SD_CACHE_DIR;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.SD_IMAGES_ROOT;
  delete process.env.SD_EXTRA_IMAGES_ROOT;
  delete process.env.SD_CACHE_DIR;
});

describe("parsePoseName", () => {
  it("parses base pose without variant", () => {
    const parsed = parsePoseName("Base.png");

    expect(parsed.poseName).toBe("Base");
    expect(parsed.poseBaseName).toBe("Base");
    expect(parsed.poseVariant).toBe(1);
  });

  it("extracts numeric variant suffix", () => {
    const parsed = parsePoseName("Full2.png");

    expect(parsed.poseName).toBe("Full2");
    expect(parsed.poseBaseName).toBe("Full");
    expect(parsed.poseVariant).toBe(2);
  });

  it("keeps spaces and normalizes separators", () => {
    const parsed = parsePoseName("Lying_Side-On-Bed3.png");

    expect(parsed.poseName).toBe("Lying Side On Bed3");
    expect(parsed.poseBaseName).toBe("Lying Side On Bed");
    expect(parsed.poseVariant).toBe(3);
  });
});

describe("resolveImageFilePath", () => {
  it("blocks traversal attempts", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("../secret.png");

    expect(resolved).toBeNull();
  });

  it("blocks non-png files", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("characters/3d/Anna/Base.jpg");

    expect(resolved).toBeNull();
  });

  it("resolves valid relative paths", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("characters/3d/Anna/Base.png");

    expect(resolved).toBe(path.resolve("/tmp/images", "characters/3d/Anna/Base.png"));
  });

  it("resolves a valid .mp4 relative path", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("characters/3d/Anna/Base.mp4");

    expect(resolved).toBe(path.resolve("/tmp/images", "characters/3d/Anna/Base.mp4"));
  });

  it("resolves a relative path under an extra images root", async () => {
    const extraRoot = "/tmp/extra-images";
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const resolved = resolveImageFilePath("extra-roots/0/characters/3d/Anna/Base.png");

    expect(resolved).toBe(path.resolve(extraRoot, "characters/3d/Anna/Base.png"));
  });

  it("blocks traversal attempts under an extra images root", async () => {
    const extraRoot = "/tmp/extra-images";
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const resolved = resolveImageFilePath("extra-roots/0/../../secret.png");

    expect(resolved).toBeNull();
  });

  it("returns null for an extra root index that does not exist", async () => {
    const extraRoot = "/tmp/extra-images";
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const resolved = resolveImageFilePath("extra-roots/5/characters/3d/Anna/Base.png");

    expect(resolved).toBeNull();
  });

  it("returns null for an extra-root path when no extra root is configured", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("extra-roots/0/characters/3d/Anna/Base.png");

    expect(resolved).toBeNull();
  });

  it("rejects a png that lives directly under the main root, outside the characters tree", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    const resolved = resolveImageFilePath("outside.png");

    expect(resolved).toBeNull();
  });

  it("rejects a png that lives directly under an extra root, outside its characters tree", async () => {
    const extraRoot = "/tmp/extra-images";
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const resolved = resolveImageFilePath("extra-roots/0/outside.png");

    expect(resolved).toBeNull();
  });
});

describe("getExtraImagesRootPathsFromEnv", () => {
  it("returns an empty list when SD_EXTRA_IMAGES_ROOT is not set", () => {
    expect(getExtraImagesRootPathsFromEnv()).toEqual([]);
  });

  it("treats a configured path as a root directly when it has a characters folder", async () => {
    const extraRoot = "/tmp/extra-root-direct";
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    expect(getExtraImagesRootPathsFromEnv()).toEqual([path.resolve(extraRoot)]);
  });

  it("treats immediate subdirectories with a characters folder as separate roots", async () => {
    const parentDir = "/tmp/extra-root-parent";
    await fs.mkdir(path.join(parentDir, "driveB", "characters"), { recursive: true });
    await fs.mkdir(path.join(parentDir, "driveA", "characters"), { recursive: true });
    await fs.mkdir(path.join(parentDir, "not-a-root"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = parentDir;

    expect(getExtraImagesRootPathsFromEnv()).toEqual([
      path.resolve(parentDir, "driveA"),
      path.resolve(parentDir, "driveB"),
    ]);
  });

  it("treats a symlinked subdirectory with a characters folder as a separate root", async () => {
    const parentDir = "/tmp/extra-root-symlink-parent";
    const realTarget = "/tmp/extra-root-symlink-target";
    await fs.mkdir(path.join(realTarget, "characters"), { recursive: true });
    await fs.mkdir(parentDir, { recursive: true });
    // A symlinked entry is reported by readdir as a symlink, not a directory, so it must be
    // followed explicitly rather than filtered out by an isDirectory() check alone.
    await fs.symlink(realTarget, path.join(parentDir, "linked-drive"), "dir");
    process.env.SD_EXTRA_IMAGES_ROOT = parentDir;

    expect(getExtraImagesRootPathsFromEnv()).toEqual([path.resolve(parentDir, "linked-drive")]);
  });

  it("merges roots resolved from multiple delimiter-separated entries", async () => {
    const rootOne = "/tmp/extra-root-one";
    const rootTwo = "/tmp/extra-root-two";
    await fs.mkdir(path.join(rootOne, "characters"), { recursive: true });
    await fs.mkdir(path.join(rootTwo, "characters"), { recursive: true });
    process.env.SD_EXTRA_IMAGES_ROOT = `${rootOne}${path.delimiter}${rootTwo}`;

    expect(getExtraImagesRootPathsFromEnv()).toEqual([
      path.resolve(rootOne),
      path.resolve(rootTwo),
    ]);
  });

  it("skips a configured entry that does not exist on disk", () => {
    process.env.SD_EXTRA_IMAGES_ROOT = "/tmp/does-not-exist";

    expect(getExtraImagesRootPathsFromEnv()).toEqual([]);
  });
});

describe("resolvePreviewFilePath", () => {
  it("swaps the .png extension for .preview.jpg", () => {
    const previewPath = resolvePreviewFilePath(
      path.resolve("/tmp/images", "characters/3d/Anna/Base.png"),
    );

    expect(previewPath).toBe(path.resolve("/tmp/images", "characters/3d/Anna/Base.preview.jpg"));
  });

  it("swaps the .mp4 extension for .preview.png (a manually-provided sidecar, never generated)", () => {
    const previewPath = resolvePreviewFilePath(
      path.resolve("/tmp/images", "characters/3d/Anna/Base.mp4"),
    );

    expect(previewPath).toBe(path.resolve("/tmp/images", "characters/3d/Anna/Base.preview.png"));
  });
});

describe("isVideoFilePath", () => {
  it("returns true for a .mp4 path regardless of case", () => {
    expect(isVideoFilePath("/tmp/images/characters/3d/Anna/Base.mp4")).toBe(true);
    expect(isVideoFilePath("/tmp/images/characters/3d/Anna/Base.MP4")).toBe(true);
  });

  it("returns false for a .png path", () => {
    expect(isVideoFilePath("/tmp/images/characters/3d/Anna/Base.png")).toBe(false);
  });
});

describe("readImageLibrary with video files", () => {
  it("indexes .mp4 files as mediaType 'video' alongside .png images as 'image'", async () => {
    const tempRoot = "/tmp/sd-library-video-index";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(path.join(characterDir, "Dance.mp4"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(2);
    const base = library.images.find((image) => image.poseBaseName === "Base");
    const dance = library.images.find((image) => image.poseBaseName === "Dance");
    expect(base?.mediaType).toBe("image");
    expect(dance?.mediaType).toBe("video");
  });

  it("does not index a video's own .preview.png sidecar as a standalone image", async () => {
    const tempRoot = "/tmp/sd-library-video-preview-sidecar";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Dance.mp4"), "");
    await fs.writeFile(path.join(characterDir, "Dance.preview.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(1);
    expect(library.images[0].mediaType).toBe("video");
    expect(library.images[0].relativePath).toBe("characters/3d/Anna/Dance.mp4");
  });
});

describe("readImageLibrary with characters metadata", () => {
  it("loads styles and default style from config.json", async () => {
    const tempRoot = "/tmp/sd-library-style-config";
    const comicCharacterDir = path.join(tempRoot, "characters", "comic", "Anna");
    const sketchCharacterDir = path.join(tempRoot, "characters", "sketch", "Anna");

    await fs.mkdir(comicCharacterDir, { recursive: true });
    await fs.mkdir(sketchCharacterDir, { recursive: true });
    await fs.writeFile(path.join(comicCharacterDir, "Base.png"), "");
    await fs.writeFile(path.join(sketchCharacterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "config.json"),
      JSON.stringify({
        styles: ["comic", "sketch", "unused-style"],
        defaultStyle: "sketch",
        styleLabels: {
          comic: "Comic Book",
          sketch: "Sketch Art",
          "unused-style": "Unused",
        },
        animations: ["Zoom In", "Zoom In", " Pan ", ""],
      }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.styles).toEqual(["comic", "sketch", "unused-style"]);
    expect(library.defaultStyle).toBe("sketch");
    expect(library.styleLabels).toEqual({
      comic: "Comic Book",
      sketch: "Sketch Art",
      "unused-style": "Unused",
    });
    expect(library.animations).toEqual(["Zoom In", "Pan"]);
    expect(library.images).toHaveLength(2);
    expect(library.images.every((image) => ["comic", "sketch"].includes(image.style))).toBe(true);
  });

  it("accepts extra keys in config.json", async () => {
    const tempRoot = "/tmp/sd-library-style-config-extra-keys";
    const characterDir = path.join(tempRoot, "characters", "comic", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "config.json"),
      JSON.stringify({
        styles: ["comic"],
        defaultStyle: "comic",
        styleLabels: { comic: "Comic Book" },
        unknownKey: "allowed",
      }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.styles).toEqual(["comic"]);
    expect(library.defaultStyle).toBe("comic");
    expect(library.styleLabels).toEqual({ comic: "Comic Book" });
  });

  it("re-resolves defaultStyle to an indexed style when configured default folder is missing", async () => {
    const tempRoot = "/tmp/sd-library-missing-default-style-folder";
    const sketchCharacterDir = path.join(tempRoot, "characters", "sketch", "Anna");

    await fs.mkdir(sketchCharacterDir, { recursive: true });
    await fs.writeFile(path.join(sketchCharacterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "config.json"),
      JSON.stringify({
        styles: ["comic", "sketch"],
        defaultStyle: "comic",
      }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.styles).toEqual(["comic", "sketch"]);
    expect(library.defaultStyle).toBe("sketch");
    expect(library.images).toHaveLength(1);
  });

  it("falls back to legacy styles when config.json is malformed", async () => {
    const tempRoot = "/tmp/sd-library-invalid-style-config";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(path.join(tempRoot, "config.json"), "{invalid-json");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.styles).toEqual(["realistic", "3d", "anime"]);
    expect(library.defaultStyle).toBe("3d");
    expect(library.styleLabels).toEqual({});
    expect(library.animations).toEqual([]);
  });

  it("defaults animations to an empty array when config.json omits it", async () => {
    const tempRoot = "/tmp/sd-library-no-animations-config";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "config.json"),
      JSON.stringify({ styles: ["3d"], defaultStyle: "3d" }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.animations).toEqual([]);
  });

  it("loads pose pattern filters from pose-filters.json", async () => {
    const tempRoot = "/tmp/sd-library-pose-filters";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(characterDir, "Cuddle with Paul.png"), ""),
      fs.writeFile(path.join(characterDir, "Cuddle with Pauline.png"), ""),
      fs.writeFile(path.join(characterDir, "Standing.png"), ""),
    ]);
    await fs.writeFile(
      path.join(tempRoot, "pose-filters.json"),
      JSON.stringify([
        { label: "Cuddle with Somebody", pattern: "^Cuddle with ", flags: "i" },
        { label: "Duo", pattern: "^Duo " },
        { label: "With Somebody CI", pattern: "^with ", flags: "i" },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.posePatternFilters).toHaveLength(3);
    expect(library.posePatternFilters).toEqual([
      expect.objectContaining({
        label: "Cuddle with Somebody",
        pattern: "^Cuddle with ",
        flags: "i",
      }),
      expect.objectContaining({ label: "Duo", pattern: "^Duo " }),
      expect.objectContaining({ label: "With Somebody CI", pattern: "^with ", flags: "i" }),
    ]);
    expect(library.poseFilterOptions).toEqual([
      { value: "Standing", label: "Standing" },
      {
        value: library.posePatternFilters[0].id,
        label: "Cuddle with Somebody",
      },
    ]);
  });

  it("accepts pose-filters entries with extra keys", async () => {
    const tempRoot = "/tmp/sd-library-pose-filters-extra-keys";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "With Bob.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "pose-filters.json"),
      JSON.stringify([{ label: "With Somebody", pattern: "^With ", extra: "allowed" }]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.posePatternFilters).toHaveLength(1);
    expect(library.posePatternFilters[0]).toEqual(
      expect.objectContaining({ label: "With Somebody", pattern: "^With " }),
    );
  });

  it("falls back to default pose pattern filter when pose-filters.json is invalid", async () => {
    const tempRoot = "/tmp/sd-library-invalid-pose-filters";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "With Bob.png"), "");
    await fs.writeFile(path.join(tempRoot, "pose-filters.json"), "{invalid-json");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();

    expect(library.posePatternFilters).toHaveLength(1);
    expect(library.posePatternFilters[0]).toEqual(
      expect.objectContaining({ label: "With Somebody", pattern: "^With " }),
    );
  });

  it("loads category and serie from characters.json", async () => {
    const tempRoot = "/tmp/sd-library-read-metadata";
    const annaDir = path.join(tempRoot, "characters", "3d", "Anna");
    const beaDir = path.join(tempRoot, "characters", "3d", "Bea");

    await Promise.all([
      fs.mkdir(annaDir, { recursive: true }),
      fs.mkdir(beaDir, { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(path.join(annaDir, "Base.png"), ""),
      fs.writeFile(path.join(beaDir, "Base.png"), ""),
    ]);
    await fs.writeFile(
      path.join(tempRoot, "characters", "characters.json"),
      JSON.stringify([
        {
          name: "Anna",
          category: "Hero",
          serie: "Sample",
          tags: ["Main", "Action", "greek"],
        },
        {
          name: "Bea",
          category: "Hero",
          serie: "Greek",
        },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();
    const anna = library.characters.find((character) => character.name === "Anna");

    expect(anna?.category).toBe("Hero");
    expect(anna?.serie).toBe("Sample");
    expect(anna?.tags).toEqual(["Action", "greek", "Main"]);
    expect(library.metadataFilterOptions).toEqual([
      { id: "tag::Action", type: "tag", value: "Action", label: "Action" },
      { id: "serie::Greek", type: "serie", value: "Greek", label: "Greek" },
      { id: "category::Hero", type: "category", value: "Hero", label: "Hero" },
      { id: "tag::Main", type: "tag", value: "Main", label: "Main" },
      { id: "serie::Sample", type: "serie", value: "Sample", label: "Sample" },
    ]);
    expect(library.characterMetadataFilterIdsByName.Anna).toEqual([
      "category::Hero",
      "serie::Sample",
      "tag::Action",
      "serie::Greek",
      "tag::Main",
    ]);
    expect(library.characterMetadataFilterIdsByName.Bea).toEqual([
      "category::Hero",
      "serie::Greek",
    ]);
  });

  it("accepts metadata entries with extra keys", async () => {
    const tempRoot = "/tmp/sd-library-invalid-metadata";
    const characterDir = path.join(tempRoot, "characters", "3d", "Bea");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "characters", "characters.json"),
      JSON.stringify([
        {
          name: "Bea",
          category: "Support",
          serie: "Sample",
          extra: "not-allowed",
        },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();
    const bea = library.characters.find((character) => character.name === "Bea");

    expect(bea?.category).toBe("Support");
    expect(bea?.serie).toBe("Sample");
    expect(bea?.tags).toEqual([]);
  });

  it("ignores metadata entry when tags is not a string array", async () => {
    const tempRoot = "/tmp/sd-library-invalid-metadata-tags";
    const characterDir = path.join(tempRoot, "characters", "3d", "Nora");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "characters", "characters.json"),
      JSON.stringify([
        {
          name: "Nora",
          category: "Support",
          serie: "Sample",
          tags: ["Valid", 123],
        },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();
    const nora = library.characters.find((character) => character.name === "Nora");

    expect(nora?.category).toBeNull();
    expect(nora?.serie).toBeNull();
    expect(nora?.tags).toEqual([]);
  });

  it("marks images as new only within 3 days from first discovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const tempRoot = "/tmp/sd-library-new-window";
    const tempCacheDir = "/tmp/sd-cache-new-window";
    const characterDir = path.join(tempRoot, "characters", "3d", "Nia");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const firstRead = await readImageLibrary();
    const initialImage = firstRead.images.find((image) => image.relativePath.endsWith("Base.png"));
    expect(initialImage?.isNew).toBe(true);

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const firstSeenCachePath = path.join(tempCacheDir, `${rootHash}.first-seen.json`);
    const persistedCacheRaw = await fs.readFile(firstSeenCachePath, "utf8");
    expect(JSON.parse(persistedCacheRaw)).toHaveProperty("characters/3d/Nia/Base.png");

    vi.setSystemTime(new Date("2026-01-05T00:00:00.000Z"));

    const secondRead = await readImageLibrary();
    const oldImage = secondRead.images.find((image) => image.relativePath.endsWith("Base.png"));
    expect(oldImage?.isNew).toBe(false);

    await fs.writeFile(path.join(characterDir, "Jump.png"), "");

    const thirdRead = await readImageLibrary();
    const discoveredLaterImage = thirdRead.images.find((image) =>
      image.relativePath.endsWith("Jump.png"),
    );
    expect(discoveredLaterImage?.isNew).toBe(true);

    delete process.env.SD_CACHE_DIR;
  });

  it("computes character firstSeenAt from the default style only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const tempRoot = "/tmp/sd-library-default-style-first-seen";
    const tempCacheDir = "/tmp/sd-cache-default-style-first-seen";
    const nonDefaultCharacterDir = path.join(tempRoot, "characters", "realistic", "Mia");

    await fs.mkdir(nonDefaultCharacterDir, { recursive: true });
    await fs.writeFile(path.join(nonDefaultCharacterDir, "Base.png"), "");
    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    // Older image exists only in a non-default style; it should not influence the summary date.
    await readImageLibrary();

    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    const defaultStyleCharacterDir = path.join(tempRoot, "characters", "3d", "Mia");
    await fs.mkdir(defaultStyleCharacterDir, { recursive: true });
    await fs.writeFile(path.join(defaultStyleCharacterDir, "Base.png"), "");

    const library = await readImageLibrary();
    const mia = library.characters.find((character) => character.name === "Mia");

    expect(mia?.firstSeenAt).toBe(new Date("2026-01-02T00:00:00.000Z").getTime());

    delete process.env.SD_CACHE_DIR;
  });

  it("sets cacheAvailable to false when cache persistence fails", async () => {
    const tempRoot = "/tmp/sd-library-cache-write-fail";
    const tempCacheDir = "/tmp/sd-cache-write-fail";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const writeFileSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));

    const library = await readImageLibrary();

    expect(library.cacheAvailable).toBe(false);
    expect(library.images).toHaveLength(1);

    writeFileSpy.mockRestore();

    delete process.env.SD_CACHE_DIR;
  });

  it("sets cacheAvailable to false when cache content is unreadable", async () => {
    const tempRoot = "/tmp/sd-library-cache-unreadable";
    const tempCacheDir = "/tmp/sd-cache-unreadable";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.first-seen.json`);

    await fs.mkdir(tempCacheDir, { recursive: true });
    await fs.writeFile(cacheFilePath, "{invalid-json");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const library = await readImageLibrary();

    expect(library.cacheAvailable).toBe(false);

    delete process.env.SD_CACHE_DIR;
  });

  it("sets cacheAvailable to true with successful cache operations", async () => {
    const tempRoot = "/tmp/sd-library-cache-ok";
    const tempCacheDir = "/tmp/sd-cache-ok";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const library = await readImageLibrary();

    expect(library.cacheAvailable).toBe(true);

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.first-seen.json`);
    const cacheExists = await fs
      .stat(cacheFilePath)
      .then(() => true)
      .catch(() => false);

    expect(cacheExists).toBe(true);

    delete process.env.SD_CACHE_DIR;
  });

  it("uses a matching library index cache instead of indexing image files", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T00:00:00.000Z"));

    const tempRoot = "/tmp/sd-library-index-cache-hit";
    const tempCacheDir = "/tmp/sd-cache-library-index-hit";
    const charactersRoot = path.join(tempRoot, "characters");
    const characterDir = path.join(charactersRoot, "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.library-index.json`);
    const toSnapshot = async (absolutePath: string) => ({
      relativePath: path.relative(tempRoot, absolutePath).split(path.sep).join(path.posix.sep),
      modifiedAt: Math.trunc((await fs.stat(absolutePath)).mtimeMs),
    });
    const cachedLibrary: ILibraryData = {
      rootConfigured: true,
      rootPath: tempRoot,
      defaultStyle: "3d",
      styles: ["3d"],
      styleLabels: {},
      animations: [],
      images: [
        {
          id: "cached",
          style: "3d",
          characterName: "Anna",
          poseName: "Base",
          poseBaseName: "Base",
          poseVariant: 1,
          relativePath: "characters/3d/Anna/Base.png",
          isNew: true,
          firstSeenAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
          modifiedAt: 123,
          posePatternFilterIds: [],
          mediaType: "image",
        },
      ],
      characters: [],
      poses: [],
      posePatternFilters: [],
      poseFilterOptions: [],
      metadataFilterOptions: [],
      characterMetadataFilterIdsByName: {},
      warning: null,
      cacheAvailable: true,
    };

    await fs.mkdir(tempCacheDir, { recursive: true });
    await fs.writeFile(
      cacheFilePath,
      `${JSON.stringify(
        {
          version: 6,
          rootPath: path.resolve(tempRoot),
          generatedAt: Date.now(),
          configFiles: [],
          directories: await Promise.all([
            toSnapshot(charactersRoot),
            toSnapshot(path.join(charactersRoot, "3d")),
            toSnapshot(characterDir),
          ]),
          extraRootPaths: [],
          extraDirectories: [],
          library: cachedLibrary,
        },
        null,
        2,
      )}\n`,
    );

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(1);
    expect(library.images[0]).toEqual(
      expect.objectContaining({ id: "cached", isNew: false, modifiedAt: 123 }),
    );
    expect(library.cacheAvailable).toBe(true);

    delete process.env.SD_CACHE_DIR;
  });

  it("rebuilds instead of returning a stale cache written before the animations field existed", async () => {
    const tempRoot = "/tmp/sd-library-index-cache-pre-animations";
    const tempCacheDir = "/tmp/sd-cache-library-index-pre-animations";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "config.json"),
      JSON.stringify({ styles: ["3d"], defaultStyle: "3d", animations: ["Zoom In"] }),
    );

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.library-index.json`);
    await fs.mkdir(tempCacheDir, { recursive: true });
    // Simulates a cache written by a pre-animations build of the app: same shape as a real
    // cache file, but at the old version number and with no "animations" key anywhere in it.
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify({
        version: 4,
        rootPath: path.resolve(tempRoot),
        generatedAt: Date.now(),
        configFiles: [],
        directories: [],
        extraRootPaths: [],
        extraDirectories: [],
        library: {
          rootConfigured: true,
          rootPath: tempRoot,
          defaultStyle: "3d",
          styles: ["3d"],
          styleLabels: {},
          images: [],
          characters: [],
          poses: [],
          posePatternFilters: [],
          poseFilterOptions: [],
          metadataFilterOptions: [],
          characterMetadataFilterIdsByName: {},
          warning: null,
          cacheAvailable: true,
        },
      }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const library = await readImageLibrary();

    expect(library.animations).toEqual(["Zoom In"]);
    expect(library.images).toHaveLength(1);

    delete process.env.SD_CACHE_DIR;
  });

  it("ignores a library index cache with an incompatible version", async () => {
    const tempRoot = "/tmp/sd-library-index-cache-version-mismatch";
    const tempCacheDir = "/tmp/sd-cache-library-index-version-mismatch";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");

    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.library-index.json`);
    await fs.mkdir(tempCacheDir, { recursive: true });
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify({
        version: 0,
        rootPath: path.resolve(tempRoot),
        library: { rootConfigured: true, images: [] },
      }),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    const library = await readImageLibrary();

    expect(library.images.map((image) => image.relativePath)).toEqual([
      "characters/3d/Anna/Base.png",
    ]);

    delete process.env.SD_CACHE_DIR;
  });

  it("removes the library index cache when configured", async () => {
    const tempRoot = "/tmp/sd-library-index-cache-remove";
    const tempCacheDir = "/tmp/sd-cache-library-index-remove";
    const rootHash = Buffer.from(path.resolve(tempRoot)).toString("base64url");
    const cacheFilePath = path.join(tempCacheDir, `${rootHash}.library-index.json`);

    await fs.mkdir(tempCacheDir, { recursive: true });
    await fs.writeFile(cacheFilePath, "{}\n");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    await removeLibraryIndexCache();

    await expect(fs.stat(cacheFilePath)).rejects.toThrow("ENOENT: no such file or directory");

    delete process.env.SD_CACHE_DIR;
  });
});

describe("readImageLibrary with extra image roots", () => {
  afterEach(() => {
    delete process.env.SD_EXTRA_IMAGES_ROOT;
  });

  it("merges images from an extra root, prefixing their relativePath so they resolve back to it", async () => {
    const tempRoot = "/tmp/sd-library-extra-main";
    const extraRoot = "/tmp/sd-library-extra-root";
    await fs.mkdir(path.join(tempRoot, "characters", "3d", "Anna"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "characters", "3d", "Anna", "Base.png"), "");
    await fs.mkdir(path.join(extraRoot, "characters", "3d", "Bob"), { recursive: true });
    await fs.writeFile(path.join(extraRoot, "characters", "3d", "Bob", "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(2);
    expect(library.characters.map((character) => character.name).sort()).toEqual(["Anna", "Bob"]);

    const extraImage = library.images.find((image) => image.characterName === "Bob");
    expect(extraImage?.relativePath).toBe("extra-roots/0/characters/3d/Bob/Base.png");
  });

  it("ignores an extra root's style folders that aren't part of the main root's configured styles", async () => {
    const tempRoot = "/tmp/sd-library-extra-style-main";
    const extraRoot = "/tmp/sd-library-extra-style-root";
    await fs.mkdir(path.join(tempRoot, "characters", "3d", "Anna"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "characters", "3d", "Anna", "Base.png"), "");
    await fs.mkdir(path.join(extraRoot, "characters", "anime", "Bob"), { recursive: true });
    await fs.writeFile(path.join(extraRoot, "characters", "anime", "Bob", "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(1);
    expect(library.characters.map((character) => character.name)).toEqual(["Anna"]);
  });

  it("skips an extra root whose characters folder cannot be read without failing the whole load", async () => {
    const tempRoot = "/tmp/sd-library-extra-unreadable-main";
    const extraRoot = "/tmp/sd-library-extra-unreadable-root";
    await fs.mkdir(path.join(tempRoot, "characters", "3d", "Anna"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "characters", "3d", "Anna", "Base.png"), "");
    // The extra root resolves (it has a "characters" folder) but its contents are removed before
    // the library is read, so indexing that root must fail gracefully rather than throwing.
    await fs.mkdir(path.join(extraRoot, "characters"), { recursive: true });

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(1);
    expect(library.warning).toBeNull();
  });

  it("skips an extra root whose style folder disappears mid-scan without failing the whole load", async () => {
    const tempRoot = "/tmp/sd-library-extra-race-main";
    const extraRoot = "/tmp/sd-library-extra-race-root";
    await fs.mkdir(path.join(tempRoot, "characters", "3d", "Anna"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "characters", "3d", "Anna", "Base.png"), "");
    const extraStylePath = path.join(extraRoot, "characters", "3d");
    await fs.mkdir(path.join(extraStylePath, "Bob"), { recursive: true });
    await fs.writeFile(path.join(extraStylePath, "Bob", "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;

    // The extra root's "characters" folder listing (which resolves available styles) succeeds,
    // but the "3d" style folder itself has disappeared (e.g. deleted concurrently) by the time
    // it's actually indexed.
    const realReaddir = fs.readdir.bind(fs);
    vi.spyOn(fs, "readdir").mockImplementation(((dirPath: string, options: unknown) => {
      if (dirPath === extraStylePath) {
        return Promise.reject(
          Object.assign(new Error("ENOENT: race condition"), { code: "ENOENT" }),
        );
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return realReaddir(dirPath, options as { withFileTypes: true });
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    }) as typeof fs.readdir);

    const library = await readImageLibrary();

    expect(library.images).toHaveLength(1);
    expect(library.images[0]?.characterName).toBe("Anna");
    expect(library.warning).toBeNull();
  });

  it("invalidates the cached index when the set of extra roots changes", async () => {
    const tempRoot = "/tmp/sd-library-extra-cache-main";
    const extraRoot = "/tmp/sd-library-extra-cache-root";
    const tempCacheDir = "/tmp/sd-library-extra-cache-dir";
    await fs.mkdir(path.join(tempRoot, "characters", "3d", "Anna"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "characters", "3d", "Anna", "Base.png"), "");
    await fs.mkdir(path.join(extraRoot, "characters", "3d", "Bob"), { recursive: true });
    await fs.writeFile(path.join(extraRoot, "characters", "3d", "Bob", "Base.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;
    process.env.SD_CACHE_DIR = tempCacheDir;

    // First read with no extra root configured: caches the single-image library.
    const libraryWithoutExtraRoot = await readImageLibrary();
    expect(libraryWithoutExtraRoot.images).toHaveLength(1);

    // Configuring the extra root must invalidate that cache and pick up its images too.
    process.env.SD_EXTRA_IMAGES_ROOT = extraRoot;
    const libraryWithExtraRoot = await readImageLibrary();
    expect(libraryWithExtraRoot.images).toHaveLength(2);

    delete process.env.SD_CACHE_DIR;
  });
});

const buildImage = (
  overrides: Partial<IImageItem> & Pick<IImageItem, "relativePath">,
): IImageItem => ({
  id: overrides.relativePath,
  style: "3d",
  characterName: "Anna",
  poseName: "Base",
  poseBaseName: "Base",
  poseVariant: 1,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: "image",
  ...overrides,
});

describe("findDuplicateGroups", () => {
  it("groups images sharing style, character and poseBaseName, sorted by variant", () => {
    const images: IImageItem[] = [
      buildImage({ relativePath: "characters/3d/Anna/Base 2.png", poseVariant: 2 }),
      buildImage({ relativePath: "characters/3d/Anna/Base.png", poseVariant: 1 }),
      buildImage({
        relativePath: "characters/3d/Anna/Sitting.png",
        poseName: "Sitting",
        poseBaseName: "Sitting",
      }),
    ];

    const groups = findDuplicateGroups(images);

    expect(groups).toHaveLength(1);
    expect(groups[0].poseBaseName).toBe("Base");
    expect(groups[0].images.map((image) => image.relativePath)).toEqual([
      "characters/3d/Anna/Base.png",
      "characters/3d/Anna/Base 2.png",
    ]);
  });

  it("does not group images sharing style/character/pose across different images roots", () => {
    const images: IImageItem[] = [
      buildImage({ relativePath: "characters/3d/Anna/Base.png", poseVariant: 1 }),
      buildImage({
        relativePath: "extra-roots/0/characters/3d/Anna/Base.png",
        poseVariant: 1,
      }),
    ];

    expect(findDuplicateGroups(images)).toEqual([]);
  });

  it("excludes poses that have no duplicates", () => {
    const images: IImageItem[] = [
      buildImage({ relativePath: "characters/3d/Anna/Base.png" }),
      buildImage({
        relativePath: "characters/3d/Anna/Sitting.png",
        poseName: "Sitting",
        poseBaseName: "Sitting",
      }),
    ];

    expect(findDuplicateGroups(images)).toEqual([]);
  });

  it("excludes groups missing their first image (variant 1)", () => {
    const images: IImageItem[] = [
      buildImage({ relativePath: "characters/3d/Anna/Base 2.png", poseVariant: 2 }),
      buildImage({ relativePath: "characters/3d/Anna/Base 3.png", poseVariant: 3 }),
    ];

    expect(findDuplicateGroups(images)).toEqual([]);
  });
});

describe("isDuplicateGroupReviewed", () => {
  const reviewedGroups = [
    {
      style: "3d",
      characterName: "Anna",
      poseBaseName: "Base",
      fileNames: ["Base.png", "Base 2.png"],
    },
  ];

  it("matches regardless of the order the images are listed in", () => {
    const group = {
      style: "3d",
      characterName: "Anna",
      poseBaseName: "Base",
      images: [
        buildImage({ relativePath: "characters/3d/Anna/Base 2.png", poseVariant: 2 }),
        buildImage({ relativePath: "characters/3d/Anna/Base.png", poseVariant: 1 }),
      ],
    };

    expect(isDuplicateGroupReviewed(group, reviewedGroups)).toBe(true);
  });

  it("returns false when a new file has been added to the group", () => {
    const group = {
      style: "3d",
      characterName: "Anna",
      poseBaseName: "Base",
      images: [
        buildImage({ relativePath: "characters/3d/Anna/Base.png", poseVariant: 1 }),
        buildImage({ relativePath: "characters/3d/Anna/Base 2.png", poseVariant: 2 }),
        buildImage({ relativePath: "characters/3d/Anna/Base 3.png", poseVariant: 3 }),
      ],
    };

    expect(isDuplicateGroupReviewed(group, reviewedGroups)).toBe(false);
  });

  it("returns false for an unrelated character/style/pose", () => {
    const group = {
      style: "3d",
      characterName: "Bob",
      poseBaseName: "Base",
      images: [
        buildImage({ relativePath: "characters/3d/Bob/Base.png", characterName: "Bob" }),
        buildImage({
          relativePath: "characters/3d/Bob/Base 2.png",
          characterName: "Bob",
          poseVariant: 2,
        }),
      ],
    };

    expect(isDuplicateGroupReviewed(group, reviewedGroups)).toBe(false);
  });

  it("does not treat a reviewed main-root group as covering an identical-looking group in an extra root", () => {
    const group = {
      style: "3d",
      characterName: "Anna",
      poseBaseName: "Base",
      images: [
        buildImage({ relativePath: "extra-roots/0/characters/3d/Anna/Base.png" }),
        buildImage({
          relativePath: "extra-roots/0/characters/3d/Anna/Base 2.png",
          poseVariant: 2,
        }),
      ],
    };

    expect(isDuplicateGroupReviewed(group, reviewedGroups)).toBe(false);
  });
});

describe("readReviewedDuplicateGroups / writeReviewedDuplicateGroups", () => {
  it("returns an empty array when the config file does not exist", async () => {
    const groups = await readReviewedDuplicateGroups("/tmp/sd-dup-reviews-missing");

    expect(groups).toEqual([]);
  });

  it("round-trips reviewed groups through disk", async () => {
    const tempRoot = "/tmp/sd-dup-reviews-roundtrip";
    await fs.mkdir(tempRoot, { recursive: true });

    const groupsToWrite = [
      {
        style: "3d",
        characterName: "Anna",
        poseBaseName: "Base",
        fileNames: ["Base.png", "Base 2.png"],
      },
    ];

    await writeReviewedDuplicateGroups(tempRoot, groupsToWrite);

    expect(await readReviewedDuplicateGroups(tempRoot)).toEqual(groupsToWrite);
  });

  it("ignores malformed entries in the config file", async () => {
    const tempRoot = "/tmp/sd-dup-reviews-malformed";
    await fs.mkdir(tempRoot, { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "duplicate-reviews.json"),
      JSON.stringify([{ style: "3d" }]),
    );

    expect(await readReviewedDuplicateGroups(tempRoot)).toEqual([]);
  });
});

describe("readToUpscaleEntries / setToUpscaleEntry / removeToUpscaleEntry", () => {
  it("returns an empty object when to-upscale.json does not exist", async () => {
    expect(await readToUpscaleEntries("/tmp/sd-upscale-missing")).toEqual({});
  });

  it("round-trips a marked entry through disk, creating the file if needed", async () => {
    const tempRoot = "/tmp/sd-upscale-roundtrip";
    await fs.mkdir(tempRoot, { recursive: true });

    await setToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png", "Steps: 30, Seed: 1");

    expect(await readToUpscaleEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Base.png": "Steps: 30, Seed: 1",
    });
  });

  it("removes a marked entry, leaving other entries untouched", async () => {
    const tempRoot = "/tmp/sd-upscale-remove";
    await fs.mkdir(tempRoot, { recursive: true });

    await setToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png", "raw-a");
    await setToUpscaleEntry(tempRoot, "characters/3d/Anna/Full.png", "raw-b");
    await removeToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png");

    expect(await readToUpscaleEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Full.png": "raw-b",
    });
  });

  it("is a no-op when removing an entry that is not marked", async () => {
    const tempRoot = "/tmp/sd-upscale-remove-missing";
    await fs.mkdir(tempRoot, { recursive: true });

    await expect(
      removeToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png"),
    ).resolves.toBeUndefined();
    expect(await readToUpscaleEntries(tempRoot)).toEqual({});
  });

  it("does not lose an update when two marks race to read-modify-write the same file", async () => {
    const tempRoot = "/tmp/sd-upscale-concurrent";
    await fs.mkdir(tempRoot, { recursive: true });

    // Both calls start before either has written, which would otherwise let the second write
    // clobber the first (both read the same empty starting state) — the file lock in
    // setToUpscaleEntry must serialize them so neither entry is lost.
    await Promise.all([
      setToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png", "raw-a"),
      setToUpscaleEntry(tempRoot, "characters/3d/Anna/Full.png", "raw-b"),
    ]);

    expect(await readToUpscaleEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Base.png": "raw-a",
      "characters/3d/Anna/Full.png": "raw-b",
    });
  });

  it("ignores malformed entries and files", async () => {
    const tempRoot = "/tmp/sd-upscale-malformed";
    await fs.mkdir(tempRoot, { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "to-upscale.json"),
      JSON.stringify({ "a.png": 123, "b.png": "ok" }),
    );

    expect(await readToUpscaleEntries(tempRoot)).toEqual({ "b.png": "ok" });

    await fs.writeFile(path.join(tempRoot, "to-upscale.json"), "{invalid-json");
    expect(await readToUpscaleEntries(tempRoot)).toEqual({});

    await fs.writeFile(path.join(tempRoot, "to-upscale.json"), JSON.stringify(["not", "a", "map"]));
    expect(await readToUpscaleEntries(tempRoot)).toEqual({});
  });
});

describe("readToAnimateEntries / setToAnimateEntry / removeToAnimateEntry", () => {
  it("returns an empty object when to-animate.json does not exist", async () => {
    expect(await readToAnimateEntries("/tmp/sd-animate-missing")).toEqual({});
  });

  it("round-trips a marked entry through disk, creating the file if needed", async () => {
    const tempRoot = "/tmp/sd-animate-roundtrip";
    await fs.mkdir(tempRoot, { recursive: true });

    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png", "Steps: 30", "Zoom In");

    expect(await readToAnimateEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Base.png": { metadata: "Steps: 30", action: "Zoom In" },
    });
  });

  it("overwrites the action when the same image is marked again", async () => {
    const tempRoot = "/tmp/sd-animate-overwrite";
    await fs.mkdir(tempRoot, { recursive: true });

    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png", "raw", "Zoom In");
    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png", "raw", "Pan");

    expect(await readToAnimateEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Base.png": { metadata: "raw", action: "Pan" },
    });
  });

  it("removes a marked entry, leaving other entries untouched", async () => {
    const tempRoot = "/tmp/sd-animate-remove";
    await fs.mkdir(tempRoot, { recursive: true });

    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png", "raw-a", "Zoom In");
    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Full.png", "raw-b", "Pan");
    await removeToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png");

    expect(await readToAnimateEntries(tempRoot)).toEqual({
      "characters/3d/Anna/Full.png": { metadata: "raw-b", action: "Pan" },
    });
  });

  it("ignores malformed entries", async () => {
    const tempRoot = "/tmp/sd-animate-malformed";
    await fs.mkdir(tempRoot, { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "to-animate.json"),
      JSON.stringify({
        "a.png": { metadata: "raw", action: "Pan" },
        "b.png": { metadata: "raw" },
        "c.png": "not-an-object",
      }),
    );

    expect(await readToAnimateEntries(tempRoot)).toEqual({
      "a.png": { metadata: "raw", action: "Pan" },
    });
  });
});

describe("removeMarkedActionEntries", () => {
  it("is a no-op when no images root is configured", async () => {
    delete process.env.SD_IMAGES_ROOT;

    await expect(removeMarkedActionEntries("characters/3d/Anna/Base.png")).resolves.toBeUndefined();
  });

  it("removes the entry from both to-upscale.json and to-animate.json", async () => {
    const tempRoot = "/tmp/sd-marks-remove-both";
    await fs.mkdir(tempRoot, { recursive: true });
    process.env.SD_IMAGES_ROOT = tempRoot;

    await setToUpscaleEntry(tempRoot, "characters/3d/Anna/Base.png", "raw");
    await setToAnimateEntry(tempRoot, "characters/3d/Anna/Base.png", "raw", "Zoom In");

    await removeMarkedActionEntries("characters/3d/Anna/Base.png");

    expect(await readToUpscaleEntries(tempRoot)).toEqual({});
    expect(await readToAnimateEntries(tempRoot)).toEqual({});
  });
});
