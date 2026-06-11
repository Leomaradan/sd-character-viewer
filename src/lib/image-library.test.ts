import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePoseName, readImageLibrary, resolveImageFilePath } from "@/lib/image-library";

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
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sd-library-"));
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
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sd-library-"));
    const characterDir = path.join(tempRoot, "characters", "3d", "Bea");

    await fs.mkdir(characterDir, { recursive: true });
    await fs.writeFile(path.join(characterDir, "Base.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "characters.json"),
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
});
