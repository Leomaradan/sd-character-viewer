import { describe, expect, it } from "vitest";

import type { ICharacterSummary, IImageItem, IPosePatternFilter } from "@/types/library";

import {
  applyPendingActionOverride,
  applyRatingOverride,
  buildPoseFilterOptions,
  buildPoseOptions,
  filterCharactersByMetadataOption,
  formatFirstSeenDate,
  formatStyleLabel,
  getImageUrl,
  isUpscaledFile,
  matchesRatingFilter,
  filterPoseOptionsByImages,
  pickRandomItem,
  withoutSensitiveItems,
  withoutSensitiveThumbnails,
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
      { poseFilterName: "Pose10" } as never,
      { poseFilterName: "Pose2" } as never,
      { poseFilterName: "Pose2" } as never,
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

describe("applyRatingOverride", () => {
  const image = { relativePath: "characters/3d/Anna/Casual.png", rating: "ok" } as IImageItem;

  it("keeps the image when there is no override or it changes nothing", () => {
    expect(applyRatingOverride(image, new Map())).toBe(image);
    expect(applyRatingOverride(image, new Map([[image.relativePath, "ok"]]))).toBe(image);
  });

  it("sets or clears the rating", () => {
    expect(applyRatingOverride(image, new Map([[image.relativePath, "good"]])).rating).toBe("good");
    expect(applyRatingOverride(image, new Map([[image.relativePath, null]]))).not.toHaveProperty(
      "rating",
    );
  });
});

describe("applyPendingActionOverride", () => {
  const image = { relativePath: "characters/3d/Anna/Casual.png" } as IImageItem;

  it("keeps the image when there is no override or it changes nothing", () => {
    expect(applyPendingActionOverride(image, new Map())).toBe(image);
    expect(applyPendingActionOverride(image, new Map([[image.relativePath, false]]))).toBe(image);
  });

  it("sets or clears the pending action", () => {
    const marked = applyPendingActionOverride(image, new Map([[image.relativePath, true]]));
    expect(marked.hasPendingAction).toBe(true);
    expect(
      applyPendingActionOverride(marked, new Map([[image.relativePath, false]])),
    ).not.toHaveProperty("hasPendingAction");
  });
});

describe("isUpscaledFile", () => {
  it("matches an [Upscaled] annotation in the file name, in any case or position", () => {
    expect(isUpscaledFile({ relativePath: "characters/3d/Anna/Casual [Upscaled].png" })).toBe(true);
    expect(isUpscaledFile({ relativePath: "characters/3d/Anna/Casual [ upscaled ] 2.mp4" })).toBe(
      true,
    );
    expect(isUpscaledFile({ relativePath: "characters/3d/Anna/[UPSCALED] Casual.png" })).toBe(true);
  });

  it("ignores files without it, and folder names", () => {
    expect(isUpscaledFile({ relativePath: "characters/3d/Anna/Casual.png" })).toBe(false);
    expect(isUpscaledFile({ relativePath: "characters/3d/Anna/Casual Upscaled.png" })).toBe(false);
    expect(isUpscaledFile({ relativePath: "characters/3d/[Upscaled]/Casual.png" })).toBe(false);
  });
});

describe("matchesRatingFilter", () => {
  it("keeps everything, bad files included, when nothing is checked", () => {
    expect(matchesRatingFilter({}, [])).toBe(true);
    expect(matchesRatingFilter({ rating: "ok" }, [])).toBe(true);
    expect(matchesRatingFilter({ rating: "good" }, [])).toBe(true);
    expect(matchesRatingFilter({ rating: "bad" }, [])).toBe(true);
  });

  it("keeps only files without a rating with Unrated", () => {
    expect(matchesRatingFilter({}, ["unrated"])).toBe(true);
    expect(matchesRatingFilter({ rating: "ok" }, ["unrated"])).toBe(false);
    expect(matchesRatingFilter({ rating: "good" }, ["unrated"])).toBe(false);
    expect(matchesRatingFilter({ rating: "bad" }, ["unrated"])).toBe(false);
  });

  it("combines the checked ratings, never keeping bad files", () => {
    const okOrGood = ["ok", "good"] as const;
    expect(matchesRatingFilter({}, okOrGood)).toBe(false);
    expect(matchesRatingFilter({ rating: "ok" }, okOrGood)).toBe(true);
    expect(matchesRatingFilter({ rating: "good" }, okOrGood)).toBe(true);
    expect(matchesRatingFilter({ rating: "bad" }, ["unrated", "ok", "good"])).toBe(false);
  });
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

describe("formatFirstSeenDate", () => {
  it("returns null for missing timestamps", () => {
    expect(formatFirstSeenDate(0)).toBeNull();
    expect(formatFirstSeenDate(-1)).toBeNull();
    expect(formatFirstSeenDate(Number.NaN)).toBeNull();
  });

  it("formats a timestamp as a locale date", () => {
    const timestamp = Date.UTC(2026, 9, 9, 12);
    expect(formatFirstSeenDate(timestamp)).toBe(
      new Date(timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    );
  });
});

describe("content filter helpers", () => {
  const character = (
    name: string,
    thumbnailsByStyle: Partial<Record<string, string>>,
  ): ICharacterSummary => ({
    name,
    imageCount: 1,
    poseCount: 1,
    styles: Object.keys(thumbnailsByStyle),
    thumbnailsByStyle,
    thumbnailModifiedAtByStyle: {},
    category: null,
    serie: null,
    tags: [],
    firstSeenAt: 0,
  });

  it("drops the sensitive items, returning the same list when there are none", () => {
    const safe = { id: "a", isSensitive: undefined };
    const sensitive = { id: "b", isSensitive: true };
    const items = [safe, sensitive];

    expect(withoutSensitiveItems(items)).toEqual([safe]);
    const safeOnly = [safe];
    expect(withoutSensitiveItems(safeOnly)).toBe(safeOnly);
  });

  it("drops the character thumbnails that are sensitive files", () => {
    const anna = character("Anna", { "3d": "a/3d/Base.png", anime: "a/anime/Base.png" });
    const bea = character("Bea", { "3d": "b/3d/Base.png" });
    const images = [
      { relativePath: "a/anime/Base.png", isSensitive: true },
      { relativePath: "b/3d/Base.png" },
    ];

    const result = withoutSensitiveThumbnails([anna, bea], images);

    expect(result[0].thumbnailsByStyle).toEqual({ "3d": "a/3d/Base.png" });
    expect(result[1]).toBe(bea);
    const characters = [anna];
    expect(withoutSensitiveThumbnails(characters, [{ relativePath: "x" }])).toBe(characters);
  });

  it("keeps the pose options still matched by a file, by pose name or pattern id", () => {
    const options = [
      { value: "Casual", label: "Casual" },
      { value: "Lingerie", label: "Lingerie" },
      { value: "pose-pattern::with", label: "With Somebody" },
      { value: "pose-pattern::duo", label: "Duo" },
    ];
    const images = [
      { poseFilterName: "Casual", posePatternFilterIds: [] },
      { poseFilterName: "With Zelda", posePatternFilterIds: ["pose-pattern::with"] },
    ];

    expect(filterPoseOptionsByImages(options, images).map((option) => option.label)).toEqual([
      "Casual",
      "With Somebody",
    ]);
  });
});
