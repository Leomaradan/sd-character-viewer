import { describe, expect, it } from "vitest";
import type { IPosePatternFilter } from "@/types/library";
import { buildPoseFilterOptions, buildPoseOptions, formatStyleLabel, getImageUrl } from "./utils";

const POSE_PATTERN_FILTERS: IPosePatternFilter[] = [
  { id: "pose-pattern::with-somebody", label: "With Somebody", pattern: "^With " },
  { id: "pose-pattern::duo", label: "Duo", pattern: "^Duo " },
  {
    id: "pose-pattern::with-somebody-ci",
    label: "With Somebody (CI)",
    pattern: "^with ",
    flags: "i",
  },
];

describe("image-viewer utils", () => {
  it("builds encoded image URL", () => {
    expect(getImageUrl("characters/3d/A B/Base.png")).toBe(
      "/api/image?path=characters%2F3d%2FA%20B%2FBase.png",
    );
  });

  it("formats style labels", () => {
    expect(formatStyleLabel("3d")).toBe("3D");
    expect(formatStyleLabel("anime")).toBe("Anime");
    expect(formatStyleLabel("realistic")).toBe("Realistic");
  });

  it("builds sorted unique pose options", () => {
    const options = buildPoseOptions([
      { poseBaseName: "Pose10" } as never,
      { poseBaseName: "Pose2" } as never,
      { poseBaseName: "Pose2" } as never,
    ]);

    expect(options).toEqual(["Pose2", "Pose10"]);
  });

  it("builds pose filter options with matching configured pattern filters", () => {
    const options = buildPoseFilterOptions(
      ["Base", "With Alice", "With Bob", "Jump", "Duo Pose"],
      POSE_PATTERN_FILTERS,
    );

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "Jump", label: "Jump" },
      { value: "pose-pattern::with-somebody", label: "With Somebody" },
      { value: "pose-pattern::duo", label: "Duo" },
      { value: "pose-pattern::with-somebody-ci", label: "With Somebody (CI)" },
    ]);
  });

  it("matches configured filters using regex flags", () => {
    const options = buildPoseFilterOptions(
      ["with marie", "Base"],
      [
        {
          id: "pose-pattern::with-somebody-ci",
          label: "With Somebody",
          pattern: "^with ",
          flags: "i",
        },
      ],
    );

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "pose-pattern::with-somebody-ci", label: "With Somebody" },
    ]);
  });

  it("does not add pattern filters when poses do not match their pattern", () => {
    const options = buildPoseFilterOptions(["Base", "Jump"], POSE_PATTERN_FILTERS);

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "Jump", label: "Jump" },
    ]);
  });

  it("keeps all poses unchanged when no pattern filters are configured", () => {
    const options = buildPoseFilterOptions(["Base", "With Alice"], []);

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "With Alice", label: "With Alice" },
    ]);
  });
});
