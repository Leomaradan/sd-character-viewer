import { describe, expect, it } from "vitest";

import {
  getPoseFilterName,
  getPoseMatchName,
  splitAnimationPose,
  splitVariantSuffix,
  stripAnnotations,
} from "./pose-name";

describe("stripAnnotations", () => {
  it("removes bracket annotations anywhere in the name", () => {
    expect(stripAnnotations("Casual [Upscaled]")).toBe("Casual");
    expect(stripAnnotations("Casual 2 [Upscaled]")).toBe("Casual 2");
    expect(stripAnnotations("[Extended] Dancing  (Casual) [x2]")).toBe("Dancing (Casual)");
    expect(stripAnnotations("Casual")).toBe("Casual");
  });

  it("removes (no lora) case-insensitively", () => {
    expect(stripAnnotations("Dancing (no lora)")).toBe("Dancing");
    expect(stripAnnotations("Jump (Casual) ( No  LoRA ) [Upscaled]")).toBe("Jump (Casual)");
  });
});

describe("splitVariantSuffix", () => {
  it("splits a trailing variant number", () => {
    expect(splitVariantSuffix("Casual 2")).toEqual({ base: "Casual", variant: 2 });
    expect(splitVariantSuffix("Full10")).toEqual({ base: "Full", variant: 10 });
    expect(splitVariantSuffix("Dancing (Casual) 3")).toEqual({
      base: "Dancing (Casual)",
      variant: 3,
    });
  });

  it("keeps names without a variant, or made only of digits, whole", () => {
    expect(splitVariantSuffix("Casual")).toEqual({ base: "Casual", variant: 1 });
    expect(splitVariantSuffix("2024")).toEqual({ base: "2024", variant: 1 });
  });
});

describe("splitAnimationPose", () => {
  it("splits an animation and its parenthesised pose", () => {
    expect(splitAnimationPose("Dancing (Casual)")).toEqual({
      animation: "Dancing",
      pose: "Casual",
    });
    expect(splitAnimationPose("Zoom In(Lying Side)")).toEqual({
      animation: "Zoom In",
      pose: "Lying Side",
    });
  });

  it("returns null without a usable trailing pose part", () => {
    expect(splitAnimationPose("Dancing")).toBeNull();
    expect(splitAnimationPose("(Casual)")).toBeNull();
    expect(splitAnimationPose("Dancing (Casual) extra")).toBeNull();
    expect(splitAnimationPose("Dancing ( )")).toBeNull();
  });
});

describe("getPoseFilterName", () => {
  it("ignores brackets and variants for images, keeping parentheses", () => {
    expect(getPoseFilterName("Casual 2 [Upscaled]", "image")).toBe("Casual");
    expect(getPoseFilterName("Dancing (Casual)", "image")).toBe("Dancing (Casual)");
  });

  it("uses only the pose part of an animation video", () => {
    expect(getPoseFilterName("Dancing (Casual)", "video")).toBe("Casual");
    expect(getPoseFilterName("Dancing (Casual) 2 [Extended]", "video")).toBe("Casual");
    expect(getPoseFilterName("Casual 3", "video")).toBe("Casual");
  });

  it("falls back to the raw name when it is only a bracket annotation", () => {
    expect(getPoseFilterName("[Upscaled]", "image")).toBe("[Upscaled]");
  });
});

describe("getPoseMatchName", () => {
  it("ignores annotations and the variant but keeps parentheses", () => {
    expect(getPoseMatchName("With Zelda (Skyward Sword) 2 [Upscaled]")).toBe(
      "With Zelda (Skyward Sword)",
    );
    expect(getPoseMatchName("Casual (no lora)")).toBe("Casual");
  });
});

describe("getPoseFilterName with (no lora)", () => {
  it("never uses (no lora) as the pose", () => {
    expect(getPoseFilterName("Casual (no lora)", "image")).toBe("Casual");
    expect(getPoseFilterName("Dancing (no lora)", "video")).toBe("Dancing");
    expect(getPoseFilterName("Jump (Casual) (no lora) 2", "video")).toBe("Casual");
  });
});
