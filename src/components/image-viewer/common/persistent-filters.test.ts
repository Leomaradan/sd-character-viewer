import { describe, expect, it } from "vitest";

import {
  buildNextQueryString,
  metadataFilterIdToQueryChanges,
  normalizePoseFilters,
  parseCharacterSortOrder,
  parsePoseViewStyle,
  parseShowOnlyNewImages,
  parseSelectedMetadataFilterId,
  parseSelectedPoseFilters,
  parseStyleViewStyle,
} from "@/components/image-viewer/common/persistent-filters";

describe("persistent filters", () => {
  describe("parseSelectedPoseFilters", () => {
    it("reads and trims persisted pose filters", () => {
      const params = new URLSearchParams("pose=Standing&pose=%20Jump%20&pose=%20");

      expect(parseSelectedPoseFilters(params)).toEqual(["Standing", "Jump"]);
    });
  });

  describe("parseSelectedMetadataFilterId", () => {
    it("prefers category over serie when both are present", () => {
      const params = new URLSearchParams("category=Hero&serie=Sample");

      expect(parseSelectedMetadataFilterId(params)).toBe("category::Hero");
    });

    it("reads serie when category is absent", () => {
      const params = new URLSearchParams("serie=Sample");

      expect(parseSelectedMetadataFilterId(params)).toBe("serie::Sample");
    });

    it("reads tag when category and serie are absent", () => {
      const params = new URLSearchParams("tag=Action");

      expect(parseSelectedMetadataFilterId(params)).toBe("tag::Action");
    });
  });

  describe("parseShowOnlyNewImages", () => {
    it("returns true for enabled values", () => {
      expect(parseShowOnlyNewImages(new URLSearchParams("new=1"))).toBe(true);
      expect(parseShowOnlyNewImages(new URLSearchParams("new=true"))).toBe(true);
    });

    it("returns false for disabled or missing values", () => {
      expect(parseShowOnlyNewImages(new URLSearchParams("new=0"))).toBe(false);
      expect(parseShowOnlyNewImages(new URLSearchParams("new=false"))).toBe(false);
      expect(parseShowOnlyNewImages(new URLSearchParams(""))).toBe(false);
    });
  });

  describe("normalizePoseFilters", () => {
    it("deduplicates and removes blank values", () => {
      expect(normalizePoseFilters([" Base ", "", "Base", "Jump", "Jump "])).toEqual([
        "Base",
        "Jump",
      ]);
    });
  });

  describe("parseCharacterSortOrder", () => {
    it("returns date when explicitly requested", () => {
      expect(parseCharacterSortOrder(new URLSearchParams("sort=date"))).toBe("date");
      expect(parseCharacterSortOrder(new URLSearchParams("sort=DATE"))).toBe("date");
    });

    it("defaults to name for any other value", () => {
      expect(parseCharacterSortOrder(new URLSearchParams("sort=name"))).toBe("name");
      expect(parseCharacterSortOrder(new URLSearchParams(""))).toBe("name");
    });
  });

  describe("parseStyleViewStyle", () => {
    it("reads and trims the configured style tab", () => {
      expect(parseStyleViewStyle(new URLSearchParams("styleTab=%20anime%20"))).toBe("anime");
    });

    it("returns an empty string when absent", () => {
      expect(parseStyleViewStyle(new URLSearchParams(""))).toBe("");
    });
  });

  describe("parsePoseViewStyle", () => {
    it("reads and trims the configured style filter", () => {
      expect(parsePoseViewStyle(new URLSearchParams("poseStyle=%20realistic%20"))).toBe(
        "realistic",
      );
    });

    it("defaults to --all-- when absent or blank", () => {
      expect(parsePoseViewStyle(new URLSearchParams(""))).toBe("--all--");
      expect(parsePoseViewStyle(new URLSearchParams("poseStyle=%20"))).toBe("--all--");
    });
  });

  describe("metadataFilterIdToQueryChanges", () => {
    it("maps category filter id to query changes", () => {
      expect(metadataFilterIdToQueryChanges("category::Hero")).toEqual({
        category: "Hero",
        serie: null,
        tag: null,
      });
    });

    it("maps serie filter id to query changes", () => {
      expect(metadataFilterIdToQueryChanges("serie::Sample")).toEqual({
        category: null,
        serie: "Sample",
        tag: null,
      });
    });

    it("maps tag filter id to query changes", () => {
      expect(metadataFilterIdToQueryChanges("tag::Action")).toEqual({
        category: null,
        serie: null,
        tag: "Action",
      });
    });

    it("clears metadata query params for empty filter ids", () => {
      expect(metadataFilterIdToQueryChanges("")).toEqual({
        category: null,
        serie: null,
        tag: null,
      });
      expect(metadataFilterIdToQueryChanges("category:: ")).toEqual({
        category: null,
        serie: null,
        tag: null,
      });
    });
  });

  describe("buildNextQueryString", () => {
    it("updates filter params while preserving unrelated query params", () => {
      const params = new URLSearchParams(
        "view=pose&char=alice&pose=Standing&category=Hero&keep=value",
      );

      const next = buildNextQueryString(params, {
        char: null,
        pose: normalizePoseFilters([" Jump ", "Jump", ""]),
        serie: "Main",
        category: null,
      });

      expect(new URLSearchParams(next).toString()).toBe(
        "view=pose&keep=value&pose=Jump&serie=Main",
      );
    });
  });
});
