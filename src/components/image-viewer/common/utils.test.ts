import { describe, expect, it } from "vitest";

import type { ICharacterSummary, IPosePatternFilter } from "@/types/library";

import {
  buildPoseFilterOptions,
  buildPoseOptions,
  filterCharactersByMetadataOption,
  formatStyleLabel,
  getImageUrl,
  pickRandomItem,
} from "./utils";

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

  it("builds encoded preview image URL", () => {
    expect(getImageUrl("characters/3d/A B/Base.png", { preview: true })).toBe(
      "/api/image?path=characters%2F3d%2FA%20B%2FBase.png&variant=preview",
    );
  });

  it("adds an image timestamp to the URL when provided", () => {
    expect(getImageUrl("characters/3d/A B/Base.png", { timestamp: 1_700_000_000_123 })).toBe(
      "/api/image?path=characters%2F3d%2FA%20B%2FBase.png&t=1700000000123",
    );
  });

  it("keeps the preview variant when an image timestamp is provided", () => {
    expect(
      getImageUrl("characters/3d/A B/Base.png", {
        preview: true,
        timestamp: 1_700_000_000_123,
      }),
    ).toBe("/api/image?path=characters%2F3d%2FA%20B%2FBase.png&t=1700000000123&variant=preview");
  });

  it("formats style labels", () => {
    expect(formatStyleLabel("3d")).toBe("3D");
    expect(formatStyleLabel("anime")).toBe("Anime");
    expect(formatStyleLabel("realistic")).toBe("Realistic");
    expect(formatStyleLabel("comic_book")).toBe("Comic Book");
  });

  it("prefers configured style labels when provided", () => {
    expect(formatStyleLabel("comic_book", { comic_book: "Comic Book Deluxe" })).toBe(
      "Comic Book Deluxe",
    );
  });

  it("returns Unknown for a blank style", () => {
    expect(formatStyleLabel("   ")).toBe("Unknown");
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

  it("ignores pattern filters with invalid regex patterns", () => {
    const options = buildPoseFilterOptions(
      ["Base", "With Alice"],
      [{ id: "pose-pattern::invalid", label: "Invalid", pattern: "(" }],
    );

    expect(options).toEqual([
      { value: "Base", label: "Base" },
      { value: "With Alice", label: "With Alice" },
    ]);
  });
});

const buildCharacter = (overrides: Partial<ICharacterSummary>): ICharacterSummary => ({
  name: "Anna",
  imageCount: 1,
  poseCount: 1,
  styles: ["3d"],
  thumbnailsByStyle: {},
  thumbnailModifiedAtByStyle: {},
  category: null,
  serie: null,
  tags: [],
  firstSeenAt: 0,
  ...overrides,
});

describe("pickRandomItem", () => {
  it("returns null for an empty list", () => {
    expect(pickRandomItem([])).toBeNull();
  });

  it("picks the item matching the random value", () => {
    expect(pickRandomItem(["a", "b", "c"], () => 0)).toBe("a");
    expect(pickRandomItem(["a", "b", "c"], () => 0.5)).toBe("b");
    expect(pickRandomItem(["a", "b", "c"], () => 0.99)).toBe("c");
  });

  it("never picks out of range, even if the random source returns 1", () => {
    expect(pickRandomItem(["a", "b"], () => 1)).toBe("b");
  });

  it("uses Math.random by default", () => {
    expect(["a", "b"]).toContain(pickRandomItem(["a", "b"]));
  });
});

describe("filterCharactersByMetadataOption", () => {
  const characters = [
    buildCharacter({ name: "Anna", category: "Hero" }),
    buildCharacter({ name: "Bob", serie: "Saga" }),
    buildCharacter({ name: "Cleo", tags: ["Blonde"] }),
  ];

  it("returns every character without an option", () => {
    expect(filterCharactersByMetadataOption(characters, undefined)).toBe(characters);
  });

  it("matches category, serie, and tags case-insensitively", () => {
    const names = (value: string) =>
      filterCharactersByMetadataOption(characters, {
        id: `tag::${value}`,
        type: "tag",
        value,
        label: value,
      }).map((character) => character.name);

    expect(names("hero")).toEqual(["Anna"]);
    expect(names(" SAGA ")).toEqual(["Bob"]);
    expect(names("blonde")).toEqual(["Cleo"]);
    expect(names("missing")).toEqual([]);
  });
});
