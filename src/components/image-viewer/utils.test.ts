import { describe, expect, it } from "vitest";
import { WITH_SOMEBODY_FILTER } from "@/components/image-viewer/constants";
import { buildPoseFilterOptions, buildPoseOptions, formatStyleLabel, getImageUrl } from "./utils";

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

  it("builds pose filter options with With Somebody synthetic option", () => {
    const options = buildPoseFilterOptions(["Base", "With Alice", "With Bob", "Jump"]);

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "Jump", label: "Jump" },
      { value: WITH_SOMEBODY_FILTER, label: "With Somebody" },
    ]);
  });

  it("does not add synthetic option when no 'With ' poses are present", () => {
    const options = buildPoseFilterOptions(["Base", "Jump"]);

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "Jump", label: "Jump" },
    ]);
  });
});
