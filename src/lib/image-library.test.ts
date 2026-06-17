import path from "node:path";
import { promises as fs } from "node:fs";
import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePoseName, readImageLibrary, resolveImageFilePath } from "@/lib/image-library";

vi.mock("node:fs", async () => {
  const mockedFsModule = await import("../../__mocks__/fs.cjs");
  return mockedFsModule.default ?? mockedFsModule;
});

vi.mock("node:fs/promises", async () => {
  const mockedFsPromisesModule = await import("../../__mocks__/fs/promises.cjs");
  return mockedFsPromisesModule.default ?? mockedFsPromisesModule;
});

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

describe("readImageLibrary with characters metadata", () => {
  it("loads category and serie from characters.json", async () => {
    const tempRoot = "/tmp/sd-library-read-metadata";
    const characterDir = path.join(tempRoot, "characters", "3d", "Anna");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "characters", "characters.json"),
      JSON.stringify([
        {
          name: "Anna",
          category: "Hero",
          serie: "Sample",
        },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const library = await readImageLibrary();
    const anna = library.characters.find((character) => character.name === "Anna");

    expect(anna?.category).toBe("Hero");
    expect(anna?.serie).toBe("Sample");
  });

  it("ignores invalid entries that do not follow the schema", async () => {
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

    expect(bea?.category).toBeNull();
    expect(bea?.serie).toBeNull();
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
});
