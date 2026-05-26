import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePoseName, resolveImageFilePath } from "@/lib/image-library";

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
