import { describe, expect, it } from "vitest";

import { buildConformedStem, insertVariantNumber, isPoseConforming } from "./pose-conformity";

describe("isPoseConforming", () => {
  const poses = ["Casual", "Lying Side"];

  it("matches the pose filter name case-insensitively", () => {
    expect(isPoseConforming({ poseFilterName: "casual", posePatternFilterIds: [] }, poses)).toBe(
      true,
    );
    expect(
      isPoseConforming({ poseFilterName: "Lying Side", posePatternFilterIds: [] }, poses),
    ).toBe(true);
    expect(isPoseConforming({ poseFilterName: "Casul", posePatternFilterIds: [] }, poses)).toBe(
      false,
    );
  });

  it("accepts items whose pose comes from a pose-filters.json pattern", () => {
    expect(
      isPoseConforming(
        { poseFilterName: "With Zelda (Skyward Sword)", posePatternFilterIds: ["with"] },
        poses,
      ),
    ).toBe(true);
  });

  it("always accepts the Base thumbnail pose", () => {
    expect(isPoseConforming({ poseFilterName: "Base", posePatternFilterIds: [] }, [])).toBe(true);
  });
});

describe("buildConformedStem", () => {
  it("replaces the whole name of an image", () => {
    expect(buildConformedStem("Casul", "image", "Casual")).toBe("Casual");
    expect(buildConformedStem("Dancing (Test)", "image", "Casual")).toBe("Casual");
  });

  it("drops the variant number and keeps bracket annotations", () => {
    expect(buildConformedStem("Casul 3 [Upscaled]", "image", "Casual")).toBe("Casual [Upscaled]");
    expect(buildConformedStem("[Extended] Casul [x2]", "video", "Casual")).toBe(
      "Casual [Extended] [x2]",
    );
  });

  it("replaces only the pose part of an animation video", () => {
    expect(buildConformedStem("Dancing (Test)", "video", "Casual")).toBe("Dancing (Casual)");
    expect(buildConformedStem("Dancing (Test) 2 [Upscaled]", "video", "Casual")).toBe(
      "Dancing (Casual) [Upscaled]",
    );
  });

  it("keeps (no lora) as an annotation", () => {
    expect(buildConformedStem("Casul (no lora)", "image", "Casual")).toBe("Casual (no lora)");
    expect(buildConformedStem("Dancing (Test) (No Lora) 2", "video", "Casual")).toBe(
      "Dancing (Casual) (No Lora)",
    );
  });

  it("collapses to the animation when the target pose is the animation itself", () => {
    expect(buildConformedStem("Dancing (Test)", "video", "dancing")).toBe("dancing");
  });

  it("replaces the whole name of a video without an animation part", () => {
    expect(buildConformedStem("Casul", "video", " Casual ")).toBe("Casual");
  });
});

describe("insertVariantNumber", () => {
  it("appends the number at the very end, after annotations", () => {
    expect(insertVariantNumber("Dancing", 2)).toBe("Dancing 2");
    expect(insertVariantNumber("Casual [Upscaled]", 3)).toBe("Casual [Upscaled] 3");
    expect(insertVariantNumber("Casual (no lora)", 2)).toBe("Casual (no lora) 2");
    expect(insertVariantNumber("Dancing (Casual) ", 2)).toBe("Dancing (Casual) 2");
  });
});
