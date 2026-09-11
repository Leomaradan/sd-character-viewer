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
  isDuplicateGroupReviewed,
  parsePoseName,
  readImageLibrary,
  readReviewedDuplicateGroups,
  removeLibraryIndexCache,
  resolveImageFilePath,
  resolvePreviewFilePath,
  writeReviewedDuplicateGroups,
} from "@/lib/image-library";

beforeEach(() => {
  vol.reset();
  vi.useRealTimers();
  delete process.env.SD_IMAGES_ROOT;
  delete process.env.SD_CACHE_DIR;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.SD_IMAGES_ROOT;
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
});

describe("resolvePreviewFilePath", () => {
  it("swaps the .png extension for .preview.jpg", () => {
    const previewPath = resolvePreviewFilePath(
      path.resolve("/tmp/images", "characters/3d/Anna/Base.png"),
    );

    expect(previewPath).toBe(path.resolve("/tmp/images", "characters/3d/Anna/Base.preview.jpg"));
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
          version: 3,
          rootPath: path.resolve(tempRoot),
          generatedAt: Date.now(),
          configFiles: [],
          directories: await Promise.all([
            toSnapshot(charactersRoot),
            toSnapshot(path.join(charactersRoot, "3d")),
            toSnapshot(characterDir),
          ]),
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
